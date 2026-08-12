const express = require("express")
const upload = require("../middlewares/upload")
const Fiscal = require("../models/Fiscal")
const Notificacao = require("../models/Notificacao")
const LancamentoContabil = require("../models/LancamentoContabil")
const MovimentoCliente = require("../models/MovimentoCliente")
const Financeiro = require("../models/Financeiro")
const Cliente = require("../models/Cliente")
const DasMei = require("../models/DasMei")
const supabase = require("../config/supabase")

const router = express.Router()

const { autenticar } = require("../middlewares/authMiddleware")

function competenciaDasParaFiscal(competencia) {
  const [ano, mes] = String(competencia || "").split("-")
  return ano && mes ? `${mes}/${ano}` : String(competencia || "")
}

async function sincronizarDasMeiPublicadosNoFiscal() {
  const guias = await DasMei.findAll({ where: { publicadoNoPortal: true, rotinaAtiva: true } })

  for (const guia of guias) {
    const cliente = await Cliente.findByPk(guia.clienteId)
    if (!cliente) continue

    const observacao = `DAS-MEI:${guia.id}`
    const alerta = calcularAlertaFiscal(guia.vencimento, guia.status === "Paga" ? "Pago" : "Pendente")
    const dados = {
      cliente: cliente.nome,
      obrigacao: "DAS-MEI",
      competencia: competenciaDasParaFiscal(guia.competencia),
      vencimento: guia.vencimento,
      status: guia.status === "Paga" ? "Pago" : "Pendente",
      valor: String(guia.valor || ""),
      observacao,
      anexos: [{ nome: guia.nomeArquivo, caminho: guia.caminhoArquivo, dasMeiId: guia.id }],
      diasParaVencer: alerta.diasParaVencer,
      alertaFiscal: alerta.alertaFiscal,
      empresaId: guia.empresaId || cliente.empresaId || null,
    }

    const existente = await Fiscal.findOne({ where: { observacao } })
    if (existente) await existente.update(dados)
    else await Fiscal.create(dados)
  }
}

function calcularAlertaFiscal(vencimento, status) {
  const hoje = new Date()
  const dataVencimento = new Date(vencimento)

  hoje.setHours(0, 0, 0, 0)
  dataVencimento.setHours(0, 0, 0, 0)

  const diferencaMs = dataVencimento.getTime() - hoje.getTime()
  const diasParaVencer = Math.ceil(diferencaMs / (1000 * 60 * 60 * 24))

  let alertaFiscal = "Em dia"

  if (
    status === "Pago" ||
    status === "Enviado" ||
    status === "Pago pelo cliente" ||
    status === "Concluído"
  ) {
    alertaFiscal = "Regularizado"
  } else if (diasParaVencer < 0) {
    alertaFiscal = "Vencido"
  } else if (diasParaVencer === 0) {
    alertaFiscal = "Vence hoje"
  } else if (diasParaVencer <= 3) {
    alertaFiscal = "Vencendo"
  }

  return {
    diasParaVencer,
    alertaFiscal,
  }
}

function valorSeguro(valor) {
  if (valor === null || valor === undefined || valor === "") return 0

  let texto = String(valor).replace("R$", "").trim()

  if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".")
  }

  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function obterPlanoContaDaObrigacao(nomeObrigacao) {
  const texto = String(nomeObrigacao || "").toLowerCase()

  if (texto.includes("honor")) {
    return "Honorários Contábeis"
  }

  return "Fiscal"
}

function deveEntrarNoFinanceiro(obrigacao) {
  const texto = String(obrigacao?.obrigacao || "").toLowerCase()

  return (
    texto.includes("honor") ||
    texto.includes("serviço") ||
    texto.includes("servico") ||
    texto.includes("certificado") ||
    texto.includes("abertura") ||
    texto.includes("regularização") ||
    texto.includes("regularizacao") ||
    texto.includes("consultoria")
  )
}

async function criarFinanceiroDaObrigacaoFiscal(obrigacao, usuario, origemAcao = "Fiscal") {
  if (!deveEntrarNoFinanceiro(obrigacao)) {
    return null
  }

  const valor = valorSeguro(obrigacao.valor)

  if (valor <= 0) {
    return null
  }

  const referenciaOrigem = `fiscal:${obrigacao.id}`

  const existente = await Financeiro.findOne({
    where: {
      referenciaOrigem,
      empresaId: usuario?.empresaId || obrigacao.empresaId || null,
    },
  })

  const dadosFinanceiro = {
    descricao: `${obrigacao.obrigacao || "Serviço"} - ${obrigacao.competencia || ""}`.trim(),
    cliente: usuario?.clienteVinculado || obrigacao.cliente || "Cliente",
    tipo: "Receber",
    centroCusto: obterPlanoContaDaObrigacao(obrigacao.obrigacao),
    formaPagamento: "Confirmado pelo cliente",
    valor: String(valor),
    vencimento: new Date().toISOString().slice(0, 10),
    status: "Recebido",
    dataRecebimento: new Date().toISOString().slice(0, 10),
    anexos: Array.isArray(obrigacao.anexos) ? obrigacao.anexos : [],
    origem: origemAcao,
    referenciaOrigem,
    empresaId: usuario?.empresaId || obrigacao.empresaId || null,
  }

  if (existente) {
    await existente.update(dadosFinanceiro)
    return existente
  }

  return Financeiro.create(dadosFinanceiro)
}

function limparNomeArquivo(nome) {
  return String(nome || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
}

async function criarMovimentoClienteFiscal(obrigacao, usuario) {
  const referencia = `fiscal:${obrigacao.id}`

  const movimentoExistente = await MovimentoCliente.findOne({
    where: {
      cliente: usuario?.clienteVinculado || obrigacao.cliente,
      tipo: "Despesa",
      observacao: referencia,
    },
  })

  if (movimentoExistente) {
    return movimentoExistente
  }

  const valor = valorSeguro(obrigacao.valor)

  if (valor <= 0) {
    throw new Error(
      "Não foi possível criar movimento: pendência sem valor válido."
    )
  }

  return MovimentoCliente.create({
    cliente: usuario?.clienteVinculado || obrigacao.cliente,
    tipo: "Despesa",
    data: new Date().toISOString().slice(0, 10),
    planoContaId: null,
    planoContaNome: obterPlanoContaDaObrigacao(
      obrigacao.obrigacao
    ),
    forma: "Confirmado pelo cliente",
    descricao: `Pagamento confirmado - ${
      obrigacao.obrigacao
    }`,
    valor,
    formaPagamento: "Confirmado pelo cliente",
    comprovante: null,
    observacao: referencia,
    status: "Pendente",
  })
}

router.get("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Cliente") {
      await sincronizarDasMeiPublicadosNoFiscal()
    }

    const where = {}

    if (req.usuario.perfil === "Cliente") {
      where.cliente = req.usuario.clienteVinculado
    }

    const obrigacoesEncontradas = await Fiscal.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    const obrigacoes = req.usuario.perfil === "Cliente"
      ? obrigacoesEncontradas.filter((item) => !String(item.observacao || "").startsWith("DAS-MEI:"))
      : obrigacoesEncontradas

    if (req.usuario.perfil !== "Cliente") {
      return res.json(obrigacoes)
    }

    const cliente = await Cliente.findOne({ where: { nome: req.usuario.clienteVinculado } })
    if (!cliente) return res.json(obrigacoes)

    const guias = await DasMei.findAll({
      where: { clienteId: cliente.id, rotinaAtiva: true },
      order: [["vencimento", "ASC"]],
    })

    const guiasLiberadas = guias
      .filter((guia) => guia.publicadoNoPortal)
      .map((guia) => ({
        id: `das-mei-${guia.id}`,
        dasMeiId: guia.id,
        origem: "DAS-MEI",
        cliente: cliente.nome,
        obrigacao: "DAS-MEI",
        competencia: String(guia.competencia || "").split("-").reverse().join("/"),
        vencimento: guia.vencimento,
        valor: Number(guia.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        status: guia.status === "Paga" ? "Pago" : "Pendente",
        anexos: [{ nome: guia.nomeArquivo, dasMeiId: guia.id }],
      }))

    return res.json([...guiasLiberadas, ...obrigacoes])
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Erro ao listar obrigações",
    })
  }
})

router.get("/anexo-url", autenticar, async (req, res) => {
  try {
    const bucket = process.env.SUPABASE_BUCKET || "nexa-uploads"
    const path = req.query.path

    if (!path) {
      return res.status(400).json({
        message: "Caminho do anexo não informado.",
      })
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 5)

    if (error) throw error

    res.json({
      url: data.signedUrl,
    })
  } catch (error) {
    console.error("ERRO AO GERAR URL ASSINADA:", error)

    res.status(500).json({
      message: "Erro ao gerar URL do anexo.",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    const alerta = calcularAlertaFiscal(
      req.body.vencimento,
      req.body.status
    )

    const novaObrigacao = await Fiscal.create({
      ...req.body,
      diasParaVencer: alerta.diasParaVencer,
      alertaFiscal: alerta.alertaFiscal,
      empresaId:
        req.usuario?.empresaId ||
        req.body.empresaId ||
        null,
    })

    res.status(201).json(novaObrigacao)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Erro ao criar obrigação",
    })
  }
})
router.patch("/:id/marcar-pago-cliente", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Cliente") {
      return res.status(403).json({
        message: "Apenas cliente pode marcar como pago",
      })
    }

    const obrigacao = await Fiscal.findByPk(req.params.id)

    if (!obrigacao) {
      return res.status(404).json({
        message: "Obrigação não encontrada",
      })
    }

    if (obrigacao.cliente !== req.usuario.clienteVinculado) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    const alerta = calcularAlertaFiscal(
      obrigacao.vencimento,
      "Pago pelo cliente"
    )

    await obrigacao.update({
      status: "Pago pelo cliente",
      diasParaVencer: alerta.diasParaVencer,
      alertaFiscal: alerta.alertaFiscal,
    })

    const movimento = await criarMovimentoClienteFiscal(
      {
        ...obrigacao.dataValues,
        cliente: req.usuario.clienteVinculado,
      },
      req.usuario
    )

    const financeiro = await criarFinanceiroDaObrigacaoFiscal(
      {
        ...obrigacao.dataValues,
        cliente: req.usuario.clienteVinculado,
      },
      req.usuario,
      "Fiscal - Cliente marcou pago"
    )

    await Notificacao.create({
      empresaId: req.usuario.empresaId || obrigacao.empresaId || 1,
      clienteId: null,
      usuarioId: req.usuario.id,
      titulo: "Pendência marcada como paga",
      tipo: "fiscal_pago_cliente",
      mensagem: `Cliente ${req.usuario.clienteVinculado} marcou ${obrigacao.obrigacao || "uma pendência"} como paga.`,
    })

    res.json({
      message: "Pagamento confirmado e movimento criado com sucesso",
      obrigacao,
      movimento,
      financeiro,
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Erro ao marcar pendência como paga",
      erro: error.message,
    })
  }
})

router.post(
  "/:id/anexar-recibo",
  autenticar,
  upload.array("arquivos"),
  async (req, res) => {
    try {
      if (req.usuario.perfil !== "Cliente") {
        return res.status(403).json({
          message: "Apenas cliente pode anexar recibo",
        })
      }

      const obrigacao = await Fiscal.findByPk(req.params.id)

      if (!obrigacao) {
        return res.status(404).json({
          message: "Obrigação não encontrada",
        })
      }

      if (obrigacao.cliente !== req.usuario.clienteVinculado) {
        return res.status(403).json({
          message: "Acesso não autorizado",
        })
      }

      const arquivosRecebidos = Array.isArray(req.files) ? req.files : []

      if (arquivosRecebidos.length === 0) {
        return res.status(400).json({
          message: "Nenhum recibo enviado",
        })
      }

      const bucket = process.env.SUPABASE_BUCKET || "nexa-uploads"
      const recibos = []

      for (const file of arquivosRecebidos) {
        const nomeLimpo = limparNomeArquivo(file.originalname)
        const caminhoArquivo = `fiscal/recibos/${Date.now()}-${nomeLimpo}`

        const { error } = await supabase.storage
          .from(bucket)
          .upload(caminhoArquivo, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          })

        if (error) throw error

        recibos.push({
          nome: file.originalname,
          caminho: caminhoArquivo,
          url: caminhoArquivo,
          tipo: "recibo",
          enviadoEm: new Date().toISOString(),
        })
      }

      const anexosAtuais = Array.isArray(obrigacao.anexos)
        ? obrigacao.anexos.filter((arquivo) => arquivo.tipo !== "recibo")
        : []

      const alerta = calcularAlertaFiscal(
        obrigacao.vencimento,
        "Pago pelo cliente"
      )

      await obrigacao.update({
        anexos: [...anexosAtuais, ...recibos],
        status: "Pago pelo cliente",
        diasParaVencer: alerta.diasParaVencer,
        alertaFiscal: alerta.alertaFiscal,
      })

      const obrigacaoAtualizada = await Fiscal.findByPk(req.params.id)

      const movimento = await criarMovimentoClienteFiscal(
        {
          ...obrigacaoAtualizada.dataValues,
          cliente: req.usuario.clienteVinculado,
        },
        req.usuario
      )

      const financeiro = await criarFinanceiroDaObrigacaoFiscal(
        {
          ...obrigacaoAtualizada.dataValues,
          cliente: req.usuario.clienteVinculado,
        },
        req.usuario,
        "Fiscal - Recibo anexado"
      )

      await Notificacao.create({
        empresaId: req.usuario.empresaId || obrigacao.empresaId || 1,
        clienteId: null,
        usuarioId: req.usuario.id,
        titulo: "Recibo de pagamento anexado",
        tipo: "fiscal_recibo_cliente",
        mensagem: `Cliente ${req.usuario.clienteVinculado} anexou recibo em ${obrigacao.obrigacao || "uma pendência"}.`,
      })

      res.json({
        message: "Recibo anexado e pagamento confirmado com sucesso",
        obrigacao: obrigacaoAtualizada,
        recibos,
        movimento,
        financeiro,
      })
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: "Erro ao anexar recibo",
        erro: error.message,
      })
    }
  }
)
router.patch("/:id/concluir", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode concluir obrigação",
      })
    }

    const obrigacao = await Fiscal.findByPk(req.params.id)

    if (!obrigacao) {
      return res.status(404).json({
        message: "Obrigação não encontrada",
      })
    }

    const nomeObrigacao = obrigacao.obrigacao || "Obrigação fiscal"

    await LancamentoContabil.create({
      cliente: obrigacao.cliente,
      data: new Date().toISOString().slice(0, 10),
      competencia: obrigacao.competencia || "00/0000",
      tipo: "Despesa",
      planoConta: obterPlanoContaDaObrigacao(nomeObrigacao),
      descricao: `${nomeObrigacao} - ${obrigacao.competencia || ""}`,
      valor: obrigacao.valor || "0",
      formaPagamento: "",
      observacao:
        obrigacao.observacao ||
        "Gerado automaticamente ao concluir pendência.",
      anexos: obrigacao.anexos || [],
      empresaId: req.usuario.empresaId || obrigacao.empresaId || null,
    })

    const financeiro = await criarFinanceiroDaObrigacaoFiscal(
      obrigacao,
      req.usuario,
      "Fiscal - Escritório concluiu"
    )

    await obrigacao.update({
      status: "Concluído",
      alertaFiscal: "Regularizado",
    })

    await Notificacao.update(
      { lida: true },
      {
        where: {
          tipo: "fiscal_pago_cliente",
          lida: false,
          empresaId: req.usuario.empresaId || obrigacao.empresaId || 1,
        },
      }
    )

    await Notificacao.update(
      { lida: true },
      {
        where: {
          tipo: "fiscal_recibo_cliente",
          lida: false,
          empresaId: req.usuario.empresaId || obrigacao.empresaId || 1,
        },
      }
    )

    res.json({
      message: "Pendência concluída e lançamento contábil criado com sucesso",
      obrigacao,
      financeiro,
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Erro ao concluir obrigação",
      erro: error.message,
    })
  }
})
router.put("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params
    const obrigacao = await Fiscal.findByPk(id)

    if (!obrigacao) {
      return res.status(404).json({
        message: "Obrigação não encontrada",
      })
    }

    const alerta = calcularAlertaFiscal(
      req.body.vencimento,
      req.body.status
    )

    await obrigacao.update({
      ...req.body,
      diasParaVencer: alerta.diasParaVencer,
      alertaFiscal: alerta.alertaFiscal,
    })

    let financeiro = null

    if (["Pago", "Pago pelo cliente", "Concluído", "Recebido"].includes(req.body.status)) {
      financeiro = await criarFinanceiroDaObrigacaoFiscal(
        obrigacao,
        req.usuario,
        "Fiscal - Atualização manual"
      )
    }

    res.json({
      obrigacao,
      financeiro,
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Erro ao atualizar obrigação",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params
    const obrigacao = await Fiscal.findByPk(id)

    if (!obrigacao) {
      return res.status(404).json({
        message: "Obrigação não encontrada",
      })
    }

    await obrigacao.destroy()

    res.json({
      message: "Obrigação excluída com sucesso",
    })
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Erro ao excluir obrigação",
    })
  }
})
router.post(
  "/upload",
  autenticar,
  upload.array("arquivos"),
  async (req, res) => {
    try {
      const bucket = process.env.SUPABASE_BUCKET || "nexa-uploads"
      const arquivos = []

      for (const file of req.files) {
        const nomeLimpo = limparNomeArquivo(file.originalname)
        const caminhoArquivo = `fiscal/${Date.now()}-${nomeLimpo}`

        const { error } = await supabase.storage
          .from(bucket)
          .upload(caminhoArquivo, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          })

        if (error) throw error

        arquivos.push({
          nome: file.originalname,
          caminho: caminhoArquivo,
          url: caminhoArquivo,
          tipo: "guia",
        })
      }

      res.json(arquivos)
    } catch (error) {
      console.error(error)

      res.status(500).json({
        message: "Erro ao fazer upload fiscal",
      })
    }
  }
)

module.exports = router

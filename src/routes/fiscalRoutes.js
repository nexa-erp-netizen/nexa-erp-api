const express = require("express")
const upload = require("../middlewares/upload")
const Fiscal = require("../models/Fiscal")
const Notificacao = require("../models/Notificacao")
const LancamentoContabil = require("../models/LancamentoContabil")
const MovimentoCliente = require("../models/MovimentoCliente")
const supabase = require("../config/supabase")

const router = express.Router()

const { autenticar } = require("../middlewares/authMiddleware")

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
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      where.cliente = req.usuario.clienteVinculado
    }

    const obrigacoes = await Fiscal.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(obrigacoes)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Erro ao listar obrigações",
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
        ? obrigacao.anexos
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

    res.json(obrigacao)
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
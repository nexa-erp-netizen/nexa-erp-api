const express = require("express")
const fs = require("fs")
const upload = require("../middlewares/upload")
const MovimentoCliente = require("../models/MovimentoCliente")
const LancamentoContabil = require("../models/LancamentoContabil")
const Cliente = require("../models/Cliente")
const supabase = require("../config/supabaseClient")
const { normalizarDataMovimento, competenciaDaData } = require("../services/dataMovimentoService")

const router = express.Router()

const { autenticar } = require("../middlewares/authMiddleware")

function normalizarNomeCliente(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function valorParaNumero(valor) {
  if (typeof valor === "number") return valor

  if (valor === null || valor === undefined || valor === "") {
    return 0
  }

  let texto = String(valor)
    .replace("R$", "")
    .trim()

  const temVirgula = texto.includes(",")
  const temPonto = texto.includes(".")

  if (temVirgula) {
    texto = texto.replace(/\./g, "").replace(",", ".")
  } else if (temPonto) {
    texto = texto
  }

  const numero = Number(texto)

  return Number.isFinite(numero) ? numero : 0
}

function obterCompetencia(data) {
  return competenciaDaData(data) || "00/0000"
}

function validarDataNova(valor) {
  const resultado = normalizarDataMovimento(valor)
  return resultado.valida && !resultado.corrigida ? resultado.data : null
}

function descricaoLancamento(movimento) {
  return movimento.descricao || "Movimento do cliente"
}

async function criarLancamentoContabilDoMovimento(movimento, usuario) {
  const referencia = `movimento-cliente:${movimento.id}`

  const existente = await LancamentoContabil.findOne({
    where: {
      cliente: movimento.cliente,
      observacao: referencia,
    },
  })

  const dadosLancamento = {
    data: movimento.data,
    competencia: obterCompetencia(movimento.data),
    tipo: movimento.tipo,
    planoConta: movimento.planoContaNome || "Movimentos Cliente",
    descricao: descricaoLancamento(movimento),
    valor: valorParaNumero(movimento.valor),
    formaPagamento:
      movimento.formaPagamento || movimento.forma || "",
    anexos: movimento.comprovante
      ? [{ nome: "Comprovante", caminho: movimento.comprovante }]
      : [],
    empresaId: usuario?.empresaId || null,
  }

  if (existente) {
    await existente.update(dadosLancamento)
    return existente
  }

  return LancamentoContabil.create({
    cliente: movimento.cliente,
    ...dadosLancamento,
    observacao: referencia,
  })
}

async function removerLancamentoContabilDoMovimento(movimento) {
  const referencia = `movimento-cliente:${movimento.id}`

  await LancamentoContabil.destroy({
    where: {
      cliente: movimento.cliente,
      observacao: referencia,
    },
  })
}

async function corrigirEFiltrarDatasLegadas(movimentos, usuario) {
  const validos = []
  for (const movimento of movimentos) {
    const resultado = normalizarDataMovimento(movimento.data)
    if (!resultado.valida) {
      console.warn(`Movimento ${movimento.id} ignorado por data inválida: ${movimento.data}`)
      continue
    }
    if (resultado.corrigida) {
      await movimento.update({ data: resultado.data })
      await criarLancamentoContabilDoMovimento(movimento, usuario)
      console.warn(`Movimento ${movimento.id} corrigido de ano legado para ${resultado.data}`)
    }
    validos.push(movimento)
  }
  return validos
}

router.get("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) {
        return res.json([])
      }

      const nomeVinculado = normalizarNomeCliente(req.usuario.clienteVinculado)
      const movimentos = await MovimentoCliente.findAll({
        order: [["data", "DESC"], ["createdAt", "DESC"]],
      })

      const movimentosDoCliente = movimentos.filter(
        (movimento) => normalizarNomeCliente(movimento.cliente) === nomeVinculado
      )
      return res.json(await corrigirEFiltrarDatasLegadas(movimentosDoCliente, req.usuario))
    }

    const nomesConsultados = []

    if (req.query.clienteId) {
      const clienteEncontrado = await Cliente.findByPk(req.query.clienteId)

      if (!clienteEncontrado) {
        return res.status(404).json({
          message: "Cliente não encontrado",
        })
      }

      nomesConsultados.push(clienteEncontrado.nome)
    }

    if (req.query.cliente) {
      nomesConsultados.push(req.query.cliente)
    }

    const movimentos = await MovimentoCliente.findAll({
      order: [["data", "DESC"], ["createdAt", "DESC"]],
    })

    if (!nomesConsultados.length) {
      return res.json(await corrigirEFiltrarDatasLegadas(movimentos, req.usuario))
    }

    const nomesNormalizados = new Set(
      nomesConsultados
        .map(normalizarNomeCliente)
        .filter(Boolean)
    )

    const movimentosDoCliente = movimentos.filter((movimento) =>
      nomesNormalizados.has(normalizarNomeCliente(movimento.cliente))
    )

    res.json(await corrigirEFiltrarDatasLegadas(movimentosDoCliente, req.usuario))
  } catch (error) {
    console.error("ERRO AO LISTAR MOVIMENTOS:", error)

    res.status(500).json({
      message: "Erro ao listar movimentos",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    const dataValida = validarDataNova(req.body.data)
    if (!dataValida) return res.status(400).json({ message: "Data inválida. Informe uma data entre 1900 e o próximo ano." })
    let clienteFinal = req.body.cliente

    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) {
        return res.status(403).json({
          message: "Cliente não vinculado ao usuário",
        })
      }

      clienteFinal = req.usuario.clienteVinculado
    }

    const movimento = await MovimentoCliente.create({
      ...req.body,
      data: dataValida,
      cliente: clienteFinal,
      valor: valorParaNumero(req.body.valor),
      status: req.body.status || "Pendente",
    })

    const lancamentoContabil = await criarLancamentoContabilDoMovimento(
      movimento,
      req.usuario
    )

    res.status(201).json({
      movimento,
      lancamentoContabil,
    })
  } catch (error) {
    console.error("ERRO AO CRIAR MOVIMENTO:", error)

    res.status(500).json({
      message: "Erro ao criar movimento",
      erro: error.message,
    })
  }
})

router.post("/massa", autenticar, async (req, res) => {
  try {
    const lista = req.body.movimentos || []

    if (!Array.isArray(lista) || lista.length === 0) {
      return res.status(400).json({
        message: "Nenhum movimento enviado",
      })
    }

    const dataInvalidaIndice = lista.findIndex((item) => !validarDataNova(item.data))
    if (dataInvalidaIndice >= 0) {
      return res.status(400).json({ message: `Data inválida na linha ${dataInvalidaIndice + 1}. Corrija o ano antes de salvar.` })
    }

    const movimentosTratados = lista.map((item) => {
      let clienteFinal = item.cliente

      if (req.usuario.perfil === "Cliente") {
        clienteFinal = req.usuario.clienteVinculado
      }

      return {
        ...item,
        data: validarDataNova(item.data),
        cliente: clienteFinal,
        valor: valorParaNumero(item.valor),
        status: item.status || "Pendente",
      }
    })

    const movimentos = await MovimentoCliente.bulkCreate(movimentosTratados)

    const lancamentosContabeis = []

    for (const movimento of movimentos) {
      const lancamento = await criarLancamentoContabilDoMovimento(
        movimento,
        req.usuario
      )

      lancamentosContabeis.push(lancamento)
    }

    res.status(201).json({
      movimentos,
      lancamentosContabeis,
    })
  } catch (error) {
    console.error("ERRO AO CRIAR MOVIMENTOS EM MASSA:", error)

    res.status(500).json({
      message: "Erro ao criar movimentos em massa",
      erro: error.message,
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const movimento = await MovimentoCliente.findByPk(id)

    if (!movimento) {
      return res.status(404).json({
        message: "Movimento não encontrado",
      })
    }

    if (
      req.usuario.perfil === "Cliente" &&
      movimento.cliente !== req.usuario.clienteVinculado
    ) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    const dataInformada = req.body.data !== undefined
      ? validarDataNova(req.body.data)
      : normalizarDataMovimento(movimento.data).data
    if (!dataInformada) return res.status(400).json({ message: "Data inválida. Corrija o ano antes de salvar." })

    await movimento.update({
      ...req.body,
      cliente: req.usuario.perfil === "Cliente" ? req.usuario.clienteVinculado : (req.body.cliente || movimento.cliente),
      data: dataInformada,
      valor:
        req.body.valor !== undefined
          ? valorParaNumero(req.body.valor)
          : movimento.valor,
    })

    const lancamentoContabil = await criarLancamentoContabilDoMovimento(
      movimento,
      req.usuario
    )

    res.json({
      movimento,
      lancamentoContabil,
    })
  } catch (error) {
    console.error("ERRO AO ATUALIZAR MOVIMENTO:", error)

    res.status(500).json({
      message: "Erro ao atualizar movimento",
      erro: error.message,
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const movimento = await MovimentoCliente.findByPk(id)

    if (!movimento) {
      return res.status(404).json({
        message: "Movimento não encontrado",
      })
    }

    if (
      req.usuario.perfil === "Cliente" &&
      movimento.cliente !== req.usuario.clienteVinculado
    ) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    await removerLancamentoContabilDoMovimento(movimento)

    await movimento.destroy()

    res.json({
      message: "Movimento excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR MOVIMENTO:", error)

    res.status(500).json({
      message: "Erro ao excluir movimento",
      erro: error.message,
    })
  }
})

router.post(
  "/upload",
  autenticar,
  upload.single("arquivo"),
  async (req, res) => {
    try {
      const file = req.file

      if (!file) {
        return res.status(400).json({
          message: "Nenhum arquivo enviado",
        })
      }

      const fileBuffer = fs.readFileSync(file.path)

      const nomeArquivo = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`
      const caminhoSupabase = `movimentos/${nomeArquivo}`

      const { error } = await supabase.storage
        .from("nexa-anexos")
        .upload(caminhoSupabase, fileBuffer, {
          contentType: file.mimetype,
          upsert: false,
        })

      if (error) {
        console.error("ERRO SUPABASE:", error)

        return res.status(500).json({
          message: "Erro ao enviar comprovante para o Supabase",
        })
      }

      const { data } = supabase.storage
        .from("nexa-anexos")
        .getPublicUrl(caminhoSupabase)

      fs.unlinkSync(file.path)

      res.json({
        nome: file.originalname,
        caminho: data.publicUrl,
      })
    } catch (error) {
      console.error("ERRO NO UPLOAD DO MOVIMENTO:", error)

      res.status(500).json({
        message: "Erro ao fazer upload do comprovante",
      })
    }
  }
)

module.exports = router

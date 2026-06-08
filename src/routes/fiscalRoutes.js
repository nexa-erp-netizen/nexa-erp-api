const express = require("express")
const upload = require("../middlewares/upload")
const Fiscal = require("../models/Fiscal")
const Notificacao = require("../models/Notificacao")
const LancamentoContabil = require("../models/LancamentoContabil")
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

function extrairPathSupabase(valor) {
  if (!valor) return ""

  if (!valor.startsWith("http")) {
    return valor
  }

  const marcador = "/storage/v1/object/public/nexa-uploads/"

  if (valor.includes(marcador)) {
    return valor.split(marcador)[1]
  }

  return valor
}

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      if (req.usuario.clienteVinculado) {
        where.cliente = req.usuario.clienteVinculado
      } else {
        return res.json([])
      }
    }

    const obrigacoes = await Fiscal.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(obrigacoes)
  } catch (error) {
    console.error("ERRO AO LISTAR OBRIGAÇÕES:", error)

    res.status(500).json({
      message: "Erro ao listar obrigações",
    })
  }
})

router.get("/anexo-url", autenticar, async (req, res) => {
  try {
    const bucket = process.env.SUPABASE_BUCKET || "nexa-uploads"
    const path = extrairPathSupabase(req.query.path)

    if (!path) {
      return res.status(400).json({
        message: "Caminho do anexo não informado.",
      })
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 5)

    if (error) {
      throw error
    }

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
    const alerta = calcularAlertaFiscal(req.body.vencimento, req.body.status)

    const novaObrigacao = await Fiscal.create({
      ...req.body,
      diasParaVencer: alerta.diasParaVencer,
      alertaFiscal: alerta.alertaFiscal,
      empresaId: req.usuario?.empresaId || req.body.empresaId || null,
    })

    res.status(201).json(novaObrigacao)
  } catch (error) {
    console.error("ERRO AO CRIAR OBRIGAÇÃO:", error)

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

    try {
      await Notificacao.create({
        empresaId: req.usuario.empresaId || obrigacao.empresaId || 1,
        clienteId: null,
        usuarioId: req.usuario.id,
        titulo: "Obrigação marcada como paga",
        tipo: "fiscal_pago_cliente",
        mensagem: `Cliente ${req.usuario.clienteVinculado} marcou ${obrigacao.obrigacao || "uma obrigação fiscal"} como paga.`,
      })
    } catch (erroNotificacao) {
      console.error("ERRO AO CRIAR NOTIFICAÇÃO FISCAL:", erroNotificacao)
    }

    res.json(obrigacao)
  } catch (error) {
    console.error("ERRO AO MARCAR FISCAL COMO PAGO PELO CLIENTE:", error)

    res.status(500).json({
      message: "Erro ao marcar obrigação como paga",
    })
  }
})

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

    await LancamentoContabil.create({
      cliente: obrigacao.cliente,
      data: new Date().toISOString().slice(0, 10),
      competencia: obrigacao.competencia || "00/0000",
      tipo: "Despesa",
      planoConta: "Fiscal",
      descricao: `${obrigacao.obrigacao || "Obrigação fiscal"} - ${obrigacao.competencia || ""}`,
      valor: obrigacao.valor || "0",
      formaPagamento: "",
      observacao: obrigacao.observacao || "Gerado automaticamente ao concluir obrigação fiscal.",
      anexos: obrigacao.anexos || [],
      empresaId: obrigacao.empresaId || req.usuario.empresaId || null,
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

    res.json({
      message: "Obrigação concluída e lançamento contábil criado com sucesso",
      obrigacao,
    })
  } catch (error) {
    console.error("ERRO AO CONCLUIR OBRIGAÇÃO:", error)

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

    const alerta = calcularAlertaFiscal(req.body.vencimento, req.body.status)

    await obrigacao.update({
      ...req.body,
      diasParaVencer: alerta.diasParaVencer,
      alertaFiscal: alerta.alertaFiscal,
    })

    res.json(obrigacao)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR OBRIGAÇÃO:", error)

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
    console.error("ERRO AO EXCLUIR OBRIGAÇÃO:", error)

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
        const nomeLimpo = file.originalname.replace(/\s+/g, "-")
        const caminhoArquivo = `fiscal/${Date.now()}-${nomeLimpo}`

        const { error } = await supabase.storage
          .from(bucket)
          .upload(caminhoArquivo, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          })

        if (error) {
          throw error
        }

        arquivos.push({
          nome: file.originalname,
          caminho: caminhoArquivo,
          url: caminhoArquivo,
        })
      }

      res.json(arquivos)
    } catch (error) {
      console.error("ERRO NO UPLOAD FISCAL:", error)

      res.status(500).json({
        message: "Erro ao fazer upload fiscal",
      })
    }
  }
)

module.exports = router
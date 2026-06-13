const express = require("express")
const upload = require("../middlewares/upload")
const Declaracao = require("../models/Declaracao")
const Notificacao = require("../models/Notificacao")
const supabase = require("../config/supabase")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

function calcularAlerta(vencimento, status) {
  if (!vencimento) {
    return {
      diasParaVencer: null,
      alerta: "Sem vencimento",
    }
  }

  const hoje = new Date()
  const dataVencimento = new Date(`${vencimento}T00:00:00`)

  hoje.setHours(0, 0, 0, 0)
  dataVencimento.setHours(0, 0, 0, 0)

  const diferencaMs = dataVencimento.getTime() - hoje.getTime()
  const diasParaVencer = Math.ceil(diferencaMs / (1000 * 60 * 60 * 24))

  const statusTexto = String(status || "").toLowerCase()

  if (
    statusTexto.includes("conclu") ||
    statusTexto.includes("entregue")
  ) {
    return {
      diasParaVencer,
      alerta: "Regularizado",
    }
  }

  if (diasParaVencer < 0) {
    return {
      diasParaVencer,
      alerta: "Vencido",
    }
  }

  if (diasParaVencer === 0) {
    return {
      diasParaVencer,
      alerta: "Vence hoje",
    }
  }

  if (diasParaVencer <= 15) {
    return {
      diasParaVencer,
      alerta: "Vencendo",
    }
  }

  return {
    diasParaVencer,
    alerta: "Em dia",
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
      if (!req.usuario.clienteVinculado) {
        return res.json([])
      }

      where.cliente = req.usuario.clienteVinculado
    } else if (req.usuario.empresaId) {
      where.empresaId = req.usuario.empresaId
    }

    const declaracoes = await Declaracao.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(declaracoes)
  } catch (error) {
    console.error("ERRO AO LISTAR DECLARAÇÕES:", error)

    res.status(500).json({
      message: "Erro ao listar declarações",
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
    console.error("ERRO AO GERAR URL ASSINADA DECLARAÇÃO:", error)

    res.status(500).json({
      message: "Erro ao gerar URL do anexo.",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode criar declaração",
      })
    }

    const alerta = calcularAlerta(req.body.vencimento, req.body.status)

    const declaracao = await Declaracao.create({
      ...req.body,
      diasParaVencer: alerta.diasParaVencer,
      alerta: alerta.alerta,
      empresaId: req.usuario?.empresaId || req.body.empresaId || null,
    })

    res.status(201).json(declaracao)
  } catch (error) {
    console.error("ERRO AO CRIAR DECLARAÇÃO:", error)

    res.status(500).json({
      message: "Erro ao criar declaração",
      erro: error.message,
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode editar declaração",
      })
    }

    const declaracao = await Declaracao.findByPk(req.params.id)

    if (!declaracao) {
      return res.status(404).json({
        message: "Declaração não encontrada",
      })
    }

    const alerta = calcularAlerta(req.body.vencimento, req.body.status)

    await declaracao.update({
      ...req.body,
      diasParaVencer: alerta.diasParaVencer,
      alerta: alerta.alerta,
      empresaId: req.usuario?.empresaId || declaracao.empresaId || null,
    })

    res.json(declaracao)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR DECLARAÇÃO:", error)

    res.status(500).json({
      message: "Erro ao atualizar declaração",
      erro: error.message,
    })
  }
})

router.patch("/:id/documentos-enviados", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Cliente") {
      return res.status(403).json({
        message: "Apenas cliente pode marcar documentos como enviados",
      })
    }

    const declaracao = await Declaracao.findByPk(req.params.id)

    if (!declaracao) {
      return res.status(404).json({
        message: "Declaração não encontrada",
      })
    }

    if (declaracao.cliente !== req.usuario.clienteVinculado) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    const alerta = calcularAlerta(
      declaracao.vencimento,
      "Documentos enviados pelo cliente"
    )

    await declaracao.update({
      status: "Documentos enviados pelo cliente",
      diasParaVencer: alerta.diasParaVencer,
      alerta: alerta.alerta,
    })

    try {
      await Notificacao.create({
        empresaId: req.usuario.empresaId || declaracao.empresaId || 1,
        clienteId: null,
        usuarioId: req.usuario.id,
        titulo: "Documentos de declaração enviados",
        tipo: "declaracao_documentos_cliente",
        mensagem: `Cliente ${req.usuario.clienteVinculado} informou envio dos documentos para ${declaracao.tipo || "declaração"} ${declaracao.ano || ""}.`,
      })
    } catch (erroNotificacao) {
      console.error("ERRO AO CRIAR NOTIFICAÇÃO DECLARAÇÃO:", erroNotificacao)
    }

    res.json(declaracao)
  } catch (error) {
    console.error("ERRO AO MARCAR DOCUMENTOS DECLARAÇÃO:", error)

    res.status(500).json({
      message: "Erro ao marcar documentos como enviados",
    })
  }
})

router.patch("/:id/concluir", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode concluir declaração",
      })
    }

    const declaracao = await Declaracao.findByPk(req.params.id)

    if (!declaracao) {
      return res.status(404).json({
        message: "Declaração não encontrada",
      })
    }

    const alerta = calcularAlerta(declaracao.vencimento, "Concluída")

    await declaracao.update({
      status: "Concluída",
      alerta: alerta.alerta,
      diasParaVencer: alerta.diasParaVencer,
    })

    res.json({
      message: "Declaração concluída com sucesso",
      declaracao,
    })
  } catch (error) {
    console.error("ERRO AO CONCLUIR DECLARAÇÃO:", error)

    res.status(500).json({
      message: "Erro ao concluir declaração",
      erro: error.message,
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode excluir declaração",
      })
    }

    const declaracao = await Declaracao.findByPk(req.params.id)

    if (!declaracao) {
      return res.status(404).json({
        message: "Declaração não encontrada",
      })
    }

    await declaracao.destroy()

    res.json({
      message: "Declaração excluída com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR DECLARAÇÃO:", error)

    res.status(500).json({
      message: "Erro ao excluir declaração",
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

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          message: "Nenhum arquivo recebido.",
        })
      }

      const arquivos = []

      for (const file of req.files) {
        const nomeLimpo = file.originalname
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^\w.\-]/g, "-")

        const caminhoArquivo = `declaracoes/${Date.now()}-${nomeLimpo}`

        const { error } = await supabase.storage
          .from(bucket)
          .upload(caminhoArquivo, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          })

        if (error) {
          console.error("ERRO SUPABASE DECLARAÇÃO:", error)
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
      console.error("ERRO NO UPLOAD DECLARAÇÃO:", error)

      res.status(500).json({
        message: "Erro ao fazer upload da declaração",
        erro: error.message,
      })
    }
  }
)

module.exports = router

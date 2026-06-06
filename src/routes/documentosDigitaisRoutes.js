const express = require("express")
const fs = require("fs")
const upload = require("../middlewares/upload")
const supabase = require("../config/supabase")
const DocumentoDigital = require("../models/DocumentoDigital")
const Notificacao = require("../models/Notificacao")

const router = express.Router()

const {
  autenticar,
} = require("../middlewares/authMiddleware")

console.log("DOCUMENTOS ROUTE V2")

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) {
        return res.json([])
      }

      where.cliente = req.usuario.clienteVinculado
    }

    
    const documentos = await DocumentoDigital.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(documentos)
  } catch (error) {
    console.error("ERRO AO LISTAR DOCUMENTOS:", error)

    res.status(500).json({
      message: "Erro ao listar documentos",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    let clienteFinal = req.body.cliente

    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) {
        return res.status(403).json({
          message: "Cliente não vinculado ao usuário",
        })
      }

      clienteFinal = req.usuario.clienteVinculado
    }

    const novoDocumento = await DocumentoDigital.create({
      ...req.body,
      cliente: clienteFinal,
    })

    if (req.usuario.perfil === "Cliente") {
  await Notificacao.create({
    empresaId: req.usuario.empresaId,
    clienteId: null,
    usuarioId: req.usuario.id,
    titulo: "Documento enviado",
    tipo: "documento_enviado",
    mensagem: `Cliente ${clienteFinal} enviou um documento digital.`,
  })
}

    res.status(201).json(novoDocumento)
  } catch (error) {
    console.error("ERRO AO CRIAR DOCUMENTO:", error)

    res.status(500).json({
      message: "Erro ao criar documento",
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const documento = await DocumentoDigital.findByPk(id)

    if (!documento) {
      return res.status(404).json({
        message: "Documento não encontrado",
      })
    }

    if (
      req.usuario.perfil === "Cliente" &&
      documento.cliente !== req.usuario.clienteVinculado
    ) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    await documento.update(req.body)

    res.json(documento)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR DOCUMENTO:", error)

    res.status(500).json({
      message: "Erro ao atualizar documento",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode excluir documentos",
      })
    }

    const { id } = req.params

    const documento = await DocumentoDigital.findByPk(id)

    if (!documento) {
      return res.status(404).json({
        message: "Documento não encontrado",
      })
    }

    await documento.destroy()

    res.json({
      message: "Documento excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR DOCUMENTO:", error)

    res.status(500).json({
      message: "Erro ao excluir documento",
    })
  }
})

router.post(
  "/upload",
  autenticar,
  upload.array("arquivos"),
  async (req, res) => {
    try {
      const arquivos = []

      for (const file of req.files) {
        const fileBuffer = fs.readFileSync(file.path)

        const nomeArquivo = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`
        const caminhoSupabase = `documentos/${nomeArquivo}`

        const { error } = await supabase.storage
          .from("nexa-anexos")
          .upload(caminhoSupabase, fileBuffer, {
            contentType: file.mimetype,
            upsert: false,
          })

        if (error) {
          console.error("ERRO SUPABASE:", error)

          return res.status(500).json({
            message: "Erro ao enviar anexo para o Supabase",
          })
        }

        const { data } = supabase.storage
          .from("nexa-anexos")
          .getPublicUrl(caminhoSupabase)

        fs.unlinkSync(file.path)

        arquivos.push({
          nome: file.originalname,
          caminho: data.publicUrl,
        })
      }

      res.json(arquivos)
    } catch (error) {
      console.error("ERRO NO UPLOAD DE DOCUMENTO:", error)

      res.status(500).json({
        message: "Erro ao fazer upload de documento",
      })
    }
  }
)

module.exports = router
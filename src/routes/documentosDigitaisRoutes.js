const express = require("express")
const upload = require("../middlewares/upload")
const DocumentoDigital = require("../models/DocumentoDigital")

const router = express.Router()

const {
  autenticar,
} = require("../middlewares/authMiddleware")

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      where.cliente =
        req.usuario.clienteVinculado
    }

    const documentos =
      await DocumentoDigital.findAll({
        where,
        order: [["createdAt", "DESC"]],
      })

    res.json(documentos)
  } catch (error) {
    console.error(
      "ERRO AO LISTAR DOCUMENTOS:",
      error
    )

    res.status(500).json({
      message: "Erro ao listar documentos",
    })
  }
})

router.post("/", async (req, res) => {
  try {
    const novoDocumento = await DocumentoDigital.create(req.body)

    res.status(201).json(novoDocumento)
  } catch (error) {
    console.error("ERRO AO CRIAR DOCUMENTO:", error)

    res.status(500).json({
      message: "Erro ao criar documento",
    })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const documento = await DocumentoDigital.findByPk(id)

    if (!documento) {
      return res.status(404).json({
        message: "Documento não encontrado",
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

router.delete("/:id", async (req, res) => {
  try {
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
  upload.array("arquivos"),
  async (req, res) => {
    try {
      const arquivos = req.files.map((file) => ({
        nome: file.originalname,
        caminho: `/uploads/${file.filename}`,
      }))

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
const express = require("express")
const Financeiro = require("../models/Financeiro")
const upload = require("../middlewares/upload")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      where.cliente = req.usuario.clienteVinculado
    }

    if (req.usuario.empresaId) {
      where.empresaId = req.usuario.empresaId
    }

    const lancamentos = await Financeiro.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(lancamentos)
  } catch (error) {
    console.error("ERRO AO LISTAR FINANCEIRO:", error)

    res.status(500).json({
      message: "Erro ao listar financeiro",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    const novoLancamento = await Financeiro.create({
      ...req.body,
      empresaId:
        req.usuario?.empresaId ||
        req.body.empresaId ||
        null,
    })

    res.status(201).json(novoLancamento)
  } catch (error) {
    res.status(500).json({
      message: "Erro ao criar lançamento",
      error,
    })
  }
})

router.post(
  "/upload",
  autenticar,
  upload.array("arquivos"),
  async (req, res) => {
    try {
      const arquivos = req.files.map((file) => ({
        nome: file.originalname,
        caminho: `/uploads/${file.filename}`,
      }))

      res.json(arquivos)
    } catch (error) {
      res.status(500).json({
        message: "Erro ao enviar anexo financeiro",
      })
    }
  }
)

module.exports = router
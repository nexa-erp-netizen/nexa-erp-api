const express = require("express")
const Cliente = require("../models/Cliente")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.empresaId) {
      where.empresaId = req.usuario.empresaId
    }

    const clientes = await Cliente.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(clientes)
  } catch (error) {
    res.status(500).json({
      message: "Erro ao listar clientes",
      error,
    })
  }
})
router.post("/", autenticar, async (req, res) => {
  try {
    const novoCliente = await Cliente.create({
      ...req.body,
      empresaId:
        req.usuario?.empresaId ||
        req.body.empresaId ||
        null,
    })

    res.status(201).json(novoCliente)
  } catch (error) {
    res.status(500).json({
      message: "Erro ao criar cliente",
      error,
    })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const cliente = await Cliente.findByPk(id)

    if (!cliente) {
      return res.status(404).json({
        message: "Cliente não encontrado",
      })
    }

    await cliente.update(req.body)

    res.json(cliente)
  } catch (error) {
    res.status(500).json({
      message: "Erro ao atualizar cliente",
      error,
    })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const cliente = await Cliente.findByPk(id)

    if (!cliente) {
      return res.status(404).json({
        message: "Cliente não encontrado",
      })
    }

    await cliente.destroy()

    res.json({
      message: "Cliente excluído com sucesso",
    })
  } catch (error) {
    res.status(500).json({
      message: "Erro ao excluir cliente",
      error,
    })
  }
})

module.exports = router
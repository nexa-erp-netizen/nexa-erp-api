const express = require("express")
const Cliente = require("../models/Cliente")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) {
        return res.json([])
      }

      where.nome = req.usuario.clienteVinculado
    }

    if (req.usuario.empresaId) {
      where.empresaId = req.usuario.empresaId
    }

    const clientes = await Cliente.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(clientes)
  } catch (error) {
    console.error("ERRO AO LISTAR CLIENTES:", error)

    res.status(500).json({
      message: "Erro ao listar clientes",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode cadastrar clientes",
      })
    }

    const novoCliente = await Cliente.create({
      ...req.body,
      empresaId:
        req.usuario?.empresaId ||
        req.body.empresaId ||
        null,
    })

    res.status(201).json(novoCliente)
  } catch (error) {
    console.error("ERRO AO CRIAR CLIENTE:", error)

    res.status(500).json({
      message: "Erro ao criar cliente",
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode editar cadastro",
      })
    }

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
    console.error("ERRO AO ATUALIZAR CLIENTE:", error)

    res.status(500).json({
      message: "Erro ao atualizar cliente",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode excluir cadastro",
      })
    }

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
    console.error("ERRO AO EXCLUIR CLIENTE:", error)

    res.status(500).json({
      message: "Erro ao excluir cliente",
    })
  }
})

module.exports = router
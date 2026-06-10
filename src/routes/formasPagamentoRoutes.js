const express = require("express")
const FormaPagamento = require("../models/FormaPagamento")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

router.get("/", autenticar, async (req, res) => {
  try {
    const formas = await FormaPagamento.findAll({
      order: [["nome", "ASC"]],
    })

    res.json(formas)
  } catch (error) {
    console.error("ERRO AO LISTAR FORMAS:", error)

    res.status(500).json({
      message: "Erro ao listar formas de pagamento",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode cadastrar formas",
      })
    }

    const novaForma = await FormaPagamento.create({
      nome: req.body.nome,
      tipo: req.body.tipo || "Ambos",
      ativo:
        req.body.ativo === undefined
          ? true
          : req.body.ativo,
    })

    res.status(201).json(novaForma)
  } catch (error) {
    console.error("ERRO AO CRIAR FORMA:", error)

    res.status(500).json({
      message: "Erro ao criar forma de pagamento",
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode editar formas",
      })
    }

    const forma = await FormaPagamento.findByPk(req.params.id)

    if (!forma) {
      return res.status(404).json({
        message: "Forma não encontrada",
      })
    }

    await forma.update(req.body)

    res.json(forma)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR FORMA:", error)

    res.status(500).json({
      message: "Erro ao atualizar forma de pagamento",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode excluir formas",
      })
    }

    const forma = await FormaPagamento.findByPk(req.params.id)

    if (!forma) {
      return res.status(404).json({
        message: "Forma não encontrada",
      })
    }

    await forma.destroy()

    res.json({
      message: "Forma excluída com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR FORMA:", error)

    res.status(500).json({
      message: "Erro ao excluir forma de pagamento",
    })
  }
})

module.exports = router
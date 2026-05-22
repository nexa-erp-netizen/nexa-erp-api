const express = require("express")
const Financeiro = require("../models/Financeiro")

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const lancamentos =
      await Financeiro.findAll({
        order: [["createdAt", "DESC"]],
      })

    res.json(lancamentos)
  } catch (error) {
    console.error(
      "ERRO AO LISTAR FINANCEIRO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao listar financeiro",
    })
  }
})

router.post("/", async (req, res) => {
  try {
    const novoLancamento =
      await Financeiro.create(req.body)

    res.status(201).json(
      novoLancamento
    )
  } catch (error) {
    console.error(
      "ERRO AO CRIAR LANÇAMENTO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao criar lançamento",
    })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const lancamento =
      await Financeiro.findByPk(id)

    if (!lancamento) {
      return res.status(404).json({
        message:
          "Lançamento não encontrado",
      })
    }

    await lancamento.update(req.body)

    res.json(lancamento)
  } catch (error) {
    console.error(
      "ERRO AO ATUALIZAR LANÇAMENTO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao atualizar lançamento",
    })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const lancamento =
      await Financeiro.findByPk(id)

    if (!lancamento) {
      return res.status(404).json({
        message:
          "Lançamento não encontrado",
      })
    }

    await lancamento.destroy()

    res.json({
      message:
        "Lançamento excluído com sucesso",
    })
  } catch (error) {
    console.error(
      "ERRO AO EXCLUIR LANÇAMENTO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao excluir lançamento",
    })
  }
})

module.exports = router
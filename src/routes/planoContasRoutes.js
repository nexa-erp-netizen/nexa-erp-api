const express = require("express")
const PlanoConta = require("../models/PlanoConta")

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const contas = await PlanoConta.findAll({
      order: [["createdAt", "DESC"]],
    })

    res.json(contas)
  } catch (error) {
    console.error(
      "ERRO AO LISTAR PLANO DE CONTAS:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao listar plano de contas",
    })
  }
})

router.post("/", async (req, res) => {
  try {
    const novaConta =
      await PlanoConta.create(req.body)

    res.status(201).json(novaConta)
  } catch (error) {
    console.error(
      "ERRO AO CRIAR CONTA:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao criar conta",
    })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const conta =
      await PlanoConta.findByPk(id)

    if (!conta) {
      return res.status(404).json({
        message:
          "Conta não encontrada",
      })
    }

    await conta.update(req.body)

    res.json(conta)
  } catch (error) {
    console.error(
      "ERRO AO ATUALIZAR CONTA:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao atualizar conta",
    })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const conta =
      await PlanoConta.findByPk(id)

    if (!conta) {
      return res.status(404).json({
        message:
          "Conta não encontrada",
      })
    }

    await conta.destroy()

    res.json({
      message:
        "Conta excluída com sucesso",
    })
  } catch (error) {
    console.error(
      "ERRO AO EXCLUIR CONTA:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao excluir conta",
    })
  }
})

module.exports = router
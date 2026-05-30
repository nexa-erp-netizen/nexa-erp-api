const express = require("express")
const ContaReceber = require("../models/ContaReceber")
const FluxoCaixa = require("../models/FluxoCaixa")

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const contas = await ContaReceber.findAll({
      order: [["vencimento", "ASC"]],
    })

    res.json(contas)
  } catch (error) {
    res.status(500).json({
      message: "Erro ao buscar contas",
    })
  }
})

router.post("/", async (req, res) => {
  try {
    const conta = await ContaReceber.create(req.body)

    res.status(201).json(conta)
  } catch (error) {
    console.error(error)

    res.status(500).json({
      message: "Erro ao criar conta",
    })
  }
})

router.put("/:id/receber", async (req, res) => {
  try {
    const conta = await ContaReceber.findByPk(req.params.id)

    if (!conta) {
      return res.status(404).json({
        message: "Conta não encontrada",
      })
    }

    conta.status = "Recebido"
conta.data_recebimento = new Date()

await conta.save()

await FluxoCaixa.create({
  tipo: "Entrada",
  descricao: conta.descricao,
  categoria: "Contas a Receber",
  valor: conta.valor,
  data: new Date(),
  status: "Realizado",
})

    res.json(conta)
  } catch (error) {
    res.status(500).json({
      message: "Erro ao receber conta",
    })
  }
})

module.exports = router
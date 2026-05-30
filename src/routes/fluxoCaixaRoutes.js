const express = require("express")

const FluxoCaixa = require("../models/FluxoCaixa")

const router = express.Router()

router.get("/", async (req, res) => {
  try {

    const fluxo = await FluxoCaixa.findAll({
      order: [["data", "ASC"]],
    })

    res.json(fluxo)

  } catch (error) {

    res.status(500).json({
      message: "Erro ao buscar fluxo",
    })

  }
})

router.post("/", async (req, res) => {
  try {

    const novo = await FluxoCaixa.create(
      req.body
    )

    res.status(201).json(novo)

  } catch (error) {

    console.error(error)

    res.status(500).json({
      message: "Erro ao criar lançamento",
    })

  }
})

module.exports = router
const express = require("express")
const { autenticar } = require("../middlewares/authMiddleware")
const { obterRecomendacoesCliente } = require("../controllers/recomendacoesController")

const router = express.Router()

router.get("/:clienteId", autenticar, obterRecomendacoesCliente)

module.exports = router

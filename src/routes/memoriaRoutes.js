const express = require("express")
const { autenticar } = require("../middlewares/authMiddleware")
const { obterMemoriaCliente } = require("../controllers/memoriaController")

const router = express.Router()

router.get("/:clienteId", autenticar, obterMemoriaCliente)

module.exports = router

const express = require("express")
const { autenticar, autorizarPerfis } = require("../middlewares/authMiddleware")
const { obterMemoriaCliente } = require("../controllers/memoriaController")

const router = express.Router()

router.get("/:clienteId", autenticar, autorizarPerfis("Administrador"), obterMemoriaCliente)

module.exports = router

const express = require("express")
const { autenticar } = require("../middlewares/authMiddleware")
const { simularConsultoriaTributaria } = require("../controllers/consultoriaTributariaController")

const router = express.Router()

router.post("/:clienteId/simular", autenticar, simularConsultoriaTributaria)

module.exports = router

const express = require("express")
const { autenticar, autorizarPerfis } = require("../middlewares/authMiddleware")
const { listarRadar } = require("../controllers/radarNexaController")
const router = express.Router()
router.get("/", autenticar, autorizarPerfis("Administrador", "Funcionário"), listarRadar)
module.exports = router

const express = require("express")
const { autenticar } = require("../middlewares/authMiddleware")
const { conversar, prepararContexto } = require("../controllers/conversaController")

const router = express.Router()
router.post("/", autenticar, conversar)
router.post("/contexto", autenticar, prepararContexto)
module.exports = router

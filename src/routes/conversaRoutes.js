const express = require("express")
const { autenticar } = require("../middlewares/authMiddleware")
const {
  conversar,
  contexto,
} = require("../controllers/conversaController")

const router = express.Router()

router.post("/", autenticar, conversar)
router.post("/contexto", autenticar, contexto)

module.exports = router

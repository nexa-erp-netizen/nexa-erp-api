const express = require("express")
const { autenticar } = require("../middlewares/authMiddleware")
const {
  conversar,
  contexto,
  status,
} = require("../controllers/conversaController")

const router = express.Router()

router.post("/", autenticar, conversar)
router.post("/contexto", autenticar, contexto)
router.get("/status", autenticar, status)

module.exports = router

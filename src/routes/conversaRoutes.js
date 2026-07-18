const express = require("express")
const { autenticar } = require("../middlewares/authMiddleware")
const {
  conversar,
  contexto,
  status,
} = require("../controllers/conversaController")
const {
  listarConversas,
  criarConversa,
  obterMensagens,
  atualizarConversa,
  excluirConversa,
  listarMemorias,
  excluirMemoria,
} = require("../controllers/conversaHistoricoController")

const router = express.Router()

router.get("/sessoes", autenticar, listarConversas)
router.post("/sessoes", autenticar, criarConversa)
router.get("/sessoes/:id/mensagens", autenticar, obterMensagens)
router.patch("/sessoes/:id", autenticar, atualizarConversa)
router.delete("/sessoes/:id", autenticar, excluirConversa)
router.get("/memorias", autenticar, listarMemorias)
router.delete("/memorias/:id", autenticar, excluirMemoria)
router.post("/", autenticar, conversar)
router.post("/contexto", autenticar, contexto)
router.get("/status", autenticar, status)

module.exports = router

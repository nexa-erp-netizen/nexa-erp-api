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

const {
  listar: listarVocabularioVoz,
  aprender: aprenderVocabularioVoz,
  atualizar: atualizarVocabularioVoz,
  excluir: excluirVocabularioVoz,
} = require("../controllers/vocabularioVozController")

const router = express.Router()

router.get("/vocabulario-voz", autenticar, listarVocabularioVoz)
router.post("/vocabulario-voz", autenticar, aprenderVocabularioVoz)
router.patch("/vocabulario-voz/:id", autenticar, atualizarVocabularioVoz)
router.delete("/vocabulario-voz/:id", autenticar, excluirVocabularioVoz)
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

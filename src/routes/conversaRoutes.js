const express = require("express")
const multer = require("multer")
const { autenticar } = require("../middlewares/authMiddleware")
const {
  conversar,
  contexto,
  status,
  painelDiario,
} = require("../controllers/conversaController")
const {
  listarConversas,
  criarConversa,
  obterMensagens,
  obterConversaRecente,
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

const { statusVoz, transcreverVoz, sintetizarVoz } = require("../controllers/vozController")

const router = express.Router()
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
})

router.get("/voz/status", autenticar, statusVoz)
router.post("/voz/sintetizar", autenticar, sintetizarVoz)
router.post("/voz/transcrever", autenticar, uploadAudio.single("audio"), transcreverVoz)
router.get("/vocabulario-voz", autenticar, listarVocabularioVoz)
router.post("/vocabulario-voz", autenticar, aprenderVocabularioVoz)
router.patch("/vocabulario-voz/:id", autenticar, atualizarVocabularioVoz)
router.delete("/vocabulario-voz/:id", autenticar, excluirVocabularioVoz)
router.get("/sessoes", autenticar, listarConversas)
router.post("/sessoes", autenticar, criarConversa)
router.get("/sessoes-recente", autenticar, obterConversaRecente)
router.get("/sessoes/:id/mensagens", autenticar, obterMensagens)
router.patch("/sessoes/:id", autenticar, atualizarConversa)
router.delete("/sessoes/:id", autenticar, excluirConversa)
router.get("/memorias", autenticar, listarMemorias)
router.delete("/memorias/:id", autenticar, excluirMemoria)
router.post("/", autenticar, conversar)
router.post("/contexto", autenticar, contexto)
router.get("/status", autenticar, status)
router.get("/painel-diario", autenticar, painelDiario)

module.exports = router

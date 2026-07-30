const express = require("express")
const multer = require("multer")
const Credencial = require("../models/CredencialAcessoFiscal")
const Historico = require("../models/HistoricoCredencialFiscal")
const { autenticar, autorizarPerfis } = require("../middlewares/authMiddleware")
const { criptografar, chaveConfigurada } = require("../services/cofreCredenciaisService")

const router = express.Router()
const somenteAdministrador = [autenticar, autorizarPerfis("Administrador")]
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const permitido = /\.(pfx|p12)$/i.test(file.originalname)
    cb(permitido ? null : new Error("Envie um certificado .PFX ou .P12"), permitido)
  },
})
const METODOS = new Set(["A1", "CODIGO_ACESSO", "PROCURACAO", "GOV_BR"])

function usuario(req) {
  return req.usuario?.nome || req.usuario?.email || `ID ${req.usuario?.id || "-"}`
}

function publico(item) {
  const dados = item.toJSON ? item.toJSON() : item
  return {
    id: dados.id,
    clienteId: dados.clienteId,
    cliente: dados.cliente,
    metodo: dados.metodo,
    identificador: dados.identificador || null,
    possuiSegredo: Boolean(dados.segredoCriptografado),
    possuiArquivo: Boolean(dados.arquivoCriptografado),
    nomeArquivo: dados.nomeArquivo || null,
    status: dados.status,
    ultimaValidacao: dados.ultimaValidacao,
    ativo: dados.ativo,
    createdAt: dados.createdAt,
    updatedAt: dados.updatedAt,
  }
}

router.get("/status-cofre", ...somenteAdministrador, (_req, res) => {
  res.json({ configurado: chaveConfigurada() })
})

router.get("/", ...somenteAdministrador, async (req, res) => {
  const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}
  const itens = await Credencial.findAll({ where, order: [["updatedAt", "DESC"]] })
  res.json(itens.map(publico))
})

router.get("/historico/:clienteId", ...somenteAdministrador, async (req, res) => {
  const itens = await Historico.findAll({
    where: { clienteId: Number(req.params.clienteId) },
    order: [["createdAt", "DESC"]],
    limit: 50,
  })
  res.json(itens)
})

router.post("/", ...somenteAdministrador, upload.single("certificado"), async (req, res) => {
  try {
    if (!chaveConfigurada()) return res.status(503).json({ message: "O cofre ainda não foi ativado no servidor." })
    const metodo = String(req.body.metodo || "").toUpperCase()
    if (!METODOS.has(metodo)) return res.status(400).json({ message: "Método de acesso inválido." })
    const clienteId = Number(req.body.clienteId)
    const cliente = String(req.body.cliente || "").trim()
    if (!clienteId || !cliente) return res.status(400).json({ message: "Cliente é obrigatório." })
    if (metodo === "A1" && !req.file) return res.status(400).json({ message: "Selecione o arquivo A1 (.PFX ou .P12)." })
    if (metodo !== "PROCURACAO" && !req.body.segredo && !req.file) {
      return res.status(400).json({ message: "Informe o segredo do acesso." })
    }

    const item = await Credencial.create({
      clienteId,
      cliente,
      metodo,
      identificador: String(req.body.identificador || "").trim() || null,
      segredoCriptografado: criptografar(req.body.segredo),
      arquivoCriptografado: req.file ? criptografar(req.file.buffer) : null,
      nomeArquivo: req.file?.originalname || null,
      mimeArquivo: req.file?.mimetype || null,
      status: "Configurado",
      criadoPor: usuario(req),
      atualizadoPor: usuario(req),
      ativo: true,
    })
    await Historico.create({
      credencialId: item.id, clienteId, cliente, metodo, acao: "Cadastro",
      usuario: usuario(req), detalhes: "Credencial armazenada no cofre criptografado.",
    })
    res.status(201).json(publico(item))
  } catch (error) {
    console.error("ERRO AO SALVAR CREDENCIAL FISCAL:", error)
    res.status(500).json({ message: "Não foi possível salvar a credencial no cofre." })
  }
})

router.patch("/:id/status", ...somenteAdministrador, async (req, res) => {
  const item = await Credencial.findByPk(req.params.id)
  if (!item) return res.status(404).json({ message: "Credencial não encontrada." })
  const ativo = req.body.ativo !== false
  await item.update({ ativo, status: ativo ? "Configurado" : "Inativo", atualizadoPor: usuario(req) })
  await Historico.create({
    credencialId: item.id, clienteId: item.clienteId, cliente: item.cliente,
    metodo: item.metodo, acao: ativo ? "Ativação" : "Desativação", usuario: usuario(req),
    detalhes: "Status alterado sem exposição do segredo.",
  })
  res.json(publico(item))
})

router.delete("/:id", ...somenteAdministrador, async (req, res) => {
  const item = await Credencial.findByPk(req.params.id)
  if (!item) return res.status(404).json({ message: "Credencial não encontrada." })
  await Historico.create({
    credencialId: item.id, clienteId: item.clienteId, cliente: item.cliente,
    metodo: item.metodo, acao: "Exclusão", usuario: usuario(req),
    detalhes: "Credencial removida do cofre.",
  })
  await item.destroy()
  res.json({ message: "Credencial removida." })
})

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "O certificado deve ter no máximo 3 MB." })
  }
  res.status(400).json({ message: error.message || "Arquivo inválido." })
})

module.exports = router

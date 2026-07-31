const crypto = require("crypto")
const Usuario = require("../models/Usuario")

const tentativas = new Map()
const JANELA_MS = 60_000
const LIMITE = 60

function compararSegredo(recebido, esperado) {
  const a = Buffer.from(String(recebido || ""))
  const b = Buffer.from(String(esperado || ""))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function dentroDoLimite(chave) {
  const agora = Date.now()
  const atual = tentativas.get(chave)
  if (!atual || agora - atual.inicio >= JANELA_MS) {
    tentativas.set(chave, { inicio: agora, total: 1 })
    return true
  }
  atual.total += 1
  return atual.total <= LIMITE
}

async function autenticarIntegracaoChatGPT(req, res, next) {
  const chaveConfigurada = process.env.NEXA_CHATGPT_API_KEY
  const emailConfigurado = process.env.NEXA_CHATGPT_USUARIO_EMAIL

  if (!chaveConfigurada || !emailConfigurado) {
    return res.status(503).json({ error: "Integração com ChatGPT não configurada" })
  }

  const autorizacao = String(req.headers.authorization || "")
  const chaveRecebida = autorizacao.startsWith("Bearer ") ? autorizacao.slice(7).trim() : ""
  if (!compararSegredo(chaveRecebida, chaveConfigurada)) {
    return res.status(401).json({ error: "Credencial da integração inválida" })
  }

  const origem = `${req.ip || req.socket?.remoteAddress || "desconhecido"}:${chaveRecebida.slice(0, 8)}`
  if (!dentroDoLimite(origem)) {
    return res.status(429).json({ error: "Limite temporário de consultas excedido" })
  }

  const usuario = await Usuario.findOne({ where: { email: emailConfigurado } })
  if (!usuario || !["Administrador", "Funcionário"].includes(usuario.perfil)) {
    return res.status(403).json({ error: "Usuário da integração não autorizado" })
  }

  req.usuario = {
    id: usuario.id,
    email: usuario.email,
    perfil: usuario.perfil,
    empresaId: usuario.empresaId || null,
  }
  next()
}

module.exports = { autenticarIntegracaoChatGPT, compararSegredo }

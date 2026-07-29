const express = require("express")
const Cliente = require("../models/Cliente")
const GoogleDriveConexao = require("../models/GoogleDriveConexao")
const GoogleDrivePastaCliente = require("../models/GoogleDrivePastaCliente")
const { autenticar, autorizarPerfis } = require("../middlewares/authMiddleware")
const {
  configurado,
  gerarUrlAutorizacao,
  validarEstado,
  salvarAutorizacao,
  listarPastas,
  revogar,
} = require("../services/googleDriveService")

const router = express.Router()
const somenteAdministrador = [autenticar, autorizarPerfis("Administrador")]

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
}

function pontuar(clienteNome, pastaNome) {
  const cliente = normalizar(clienteNome)
  const pasta = normalizar(pastaNome)
  if (!cliente || !pasta) return 0
  if (cliente === pasta) return 100
  if (pasta.includes(cliente) || cliente.includes(pasta)) return 80
  const palavrasCliente = new Set(cliente.split(" ").filter((p) => p.length > 2))
  const palavrasPasta = new Set(pasta.split(" ").filter((p) => p.length > 2))
  const iguais = [...palavrasCliente].filter((p) => palavrasPasta.has(p)).length
  return Math.round((iguais / Math.max(palavrasCliente.size, palavrasPasta.size, 1)) * 70)
}

router.get("/status", ...somenteAdministrador, async (req, res) => {
  const conexao = await GoogleDriveConexao.findOne({ where: { usuarioId: req.usuario.id } })
  res.json({
    configurado: configurado(),
    conectado: Boolean(conexao),
    emailGoogle: conexao?.emailGoogle || null,
    pastaRaizId: conexao?.pastaRaizId || null,
    pastaRaizNome: conexao?.pastaRaizNome || null,
  })
})

router.get("/autorizar", ...somenteAdministrador, (req, res) => {
  try {
    res.json({ url: gerarUrlAutorizacao(req.usuario.id, req.usuario.email) })
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

router.get("/callback", async (req, res) => {
  res.type("html")
  try {
    if (req.query.error) throw new Error("A autorização do Google foi cancelada")
    const { usuarioId } = validarEstado(req.query.state)
    await salvarAutorizacao({ usuarioId, code: req.query.code })
    res.send(`<!doctype html><meta charset="utf-8"><title>Nexa</title>
      <body style="font-family:Arial;background:#061a31;color:white;padding:32px">
      <h2>Google Drive conectado</h2><p>Esta janela será fechada.</p>
      <script>window.opener&&window.opener.postMessage({tipo:"nexa-google-drive-oauth",sucesso:true},"*");window.close()</script>`)
  } catch (error) {
    console.error("ERRO OAUTH GOOGLE DRIVE:", error)
    const mensagem = JSON.stringify(String(error.message || "Falha na autorização"))
    res.status(400).send(`<!doctype html><meta charset="utf-8"><title>Nexa</title>
      <body style="font-family:Arial;background:#061a31;color:white;padding:32px">
      <h2>Não foi possível conectar</h2><p>${String(error.message || "").replace(/[<>&"]/g, "")}</p>
      <script>window.opener&&window.opener.postMessage({tipo:"nexa-google-drive-oauth",sucesso:false,mensagem:${mensagem}},"*")</script>`)
  }
})

router.get("/pastas", ...somenteAdministrador, async (req, res) => {
  try {
    res.json(await listarPastas(req.usuario.id, req.query.parentId || null))
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

router.put("/pasta-raiz", ...somenteAdministrador, async (req, res) => {
  const { pastaId, pastaNome } = req.body
  if (!pastaId || !pastaNome) return res.status(400).json({ message: "Selecione a pasta principal" })
  const conexao = await GoogleDriveConexao.findOne({ where: { usuarioId: req.usuario.id } })
  if (!conexao) return res.status(400).json({ message: "Google Drive não conectado" })
  await conexao.update({ pastaRaizId: pastaId, pastaRaizNome: pastaNome })
  res.json({ message: "Pasta principal salva" })
})

router.get("/vinculos", ...somenteAdministrador, async (req, res) => {
  try {
    const [clientes, vinculos, pastas] = await Promise.all([
      Cliente.findAll({ order: [["nome", "ASC"]] }),
      GoogleDrivePastaCliente.findAll({ where: { usuarioId: req.usuario.id } }),
      listarPastas(req.usuario.id),
    ])
    const porCliente = new Map(vinculos.map((item) => [Number(item.clienteId), item]))
    const itens = clientes.map((cliente) => {
      const vinculo = porCliente.get(Number(cliente.id))
      const sugestoes = vinculo ? [] : pastas
        .map((pasta) => ({ ...pasta, score: pontuar(cliente.nome, pasta.name) }))
        .filter((pasta) => pasta.score >= 35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
      return {
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        clienteAtivo: cliente.ativo !== false,
        vinculo: vinculo ? {
          pastaId: vinculo.pastaDriveId,
          pastaNome: vinculo.pastaDriveNome,
        } : null,
        sugestoes,
      }
    })
    res.json({ itens, pastas })
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

router.put("/vinculos/:clienteId", ...somenteAdministrador, async (req, res) => {
  const cliente = await Cliente.findByPk(req.params.clienteId)
  if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })
  const { pastaId, pastaNome } = req.body
  if (!pastaId || !pastaNome) return res.status(400).json({ message: "Selecione uma pasta" })
  try {
    await GoogleDrivePastaCliente.upsert({
      usuarioId: req.usuario.id,
      clienteId: cliente.id,
      pastaDriveId: pastaId,
      pastaDriveNome: pastaNome,
    })
    res.json({ message: "Pasta vinculada ao cliente" })
  } catch (error) {
    res.status(409).json({ message: "Essa pasta já está vinculada a outro cliente" })
  }
})

router.delete("/vinculos/:clienteId", ...somenteAdministrador, async (req, res) => {
  await GoogleDrivePastaCliente.destroy({
    where: { usuarioId: req.usuario.id, clienteId: req.params.clienteId },
  })
  res.json({ message: "Vínculo removido" })
})

router.delete("/conexao", ...somenteAdministrador, async (req, res) => {
  await GoogleDrivePastaCliente.destroy({ where: { usuarioId: req.usuario.id } })
  await revogar(req.usuario.id)
  res.json({ message: "Google Drive desconectado" })
})

module.exports = router

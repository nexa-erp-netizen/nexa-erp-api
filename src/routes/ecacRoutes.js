const express = require("express")
const HistoricoEcac = require("../models/HistoricoEcac")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

router.get("/historico", autenticar, async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    const itens = await HistoricoEcac.findAll({ where, order: [["createdAt", "DESC"]], limit: 100 })
    res.json(itens)
  } catch (error) {
    console.error("ERRO AO LISTAR HISTORICO ECAC:", error)
    res.status(500).json({ message: "Erro ao listar histórico e-CAC" })
  }
})

router.post("/historico", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") return res.status(403).json({ message: "Acesso negado" })
    const clienteId = Number(req.body.clienteId)
    const cliente = String(req.body.cliente || "").trim()
    const servico = String(req.body.servico || "").trim()
    if (!clienteId || !cliente || !servico) return res.status(400).json({ message: "Cliente e serviço são obrigatórios" })
    const item = await HistoricoEcac.create({ clienteId, cliente, servico, responsavel: req.body.responsavel || null, observacoes: req.body.observacoes || null })
    res.status(201).json(item)
  } catch (error) {
    console.error("ERRO AO REGISTRAR ACESSO ECAC:", error)
    res.status(500).json({ message: "Erro ao registrar acesso e-CAC" })
  }
})

module.exports = router

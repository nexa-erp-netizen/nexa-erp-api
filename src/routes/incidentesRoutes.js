const express = require("express")
const IncidenteSistema = require("../models/IncidenteSistema")
const { registrarIncidente } = require("../services/incidenteSistemaService")
const { diagnosticoSaude, criarPlanoCorrecao } = require("../services/nexaModoDesenvolvedorService")
const PlanoCorrecaoNexa = require("../models/PlanoCorrecaoNexa")

const router = express.Router()

router.post("/capturar", async (req, res) => {
  try {
    const incidente = await registrarIncidente({ ...req.body, origem: req.body?.origem || "web", usuarioId: req.usuario.id })
    res.status(201).json({ registrado: true, incidenteId: incidente.id })
  } catch (error) {
    console.error("ERRO AO CAPTURAR INCIDENTE:", error)
    res.status(500).json({ message: "Não foi possível registrar o incidente." })
  }
})

router.use((req, res, next) => req.usuario.perfil === "Administrador" ? next() : res.status(403).json({ message: "Acesso restrito ao administrador." }))

router.get("/saude", async (_req, res) => {
  res.json(await diagnosticoSaude())
})

router.get("/planos", async (req, res) => {
  const where = req.query.status ? { status: String(req.query.status) } : {}
  res.json(await PlanoCorrecaoNexa.findAll({ where, order: [["createdAt", "DESC"]], limit: 100 }))
})

router.post("/:id/plano-correcao", async (req, res) => {
  const incidente = await IncidenteSistema.findByPk(req.params.id)
  if (!incidente) return res.status(404).json({ message: "Incidente não encontrado." })
  const plano = await criarPlanoCorrecao({ incidente, usuario: req.usuario })
  if (incidente.status === "Aberto") await incidente.update({ status: "Em diagnóstico" })
  res.status(201).json(plano)
})

router.get("/", async (req, res) => {
  const where = {}
  if (req.query.status) where.status = req.query.status
  res.json(await IncidenteSistema.findAll({ where, order: [["ultimaOcorrenciaEm", "DESC"]], limit: Math.min(200, Number(req.query.limite) || 50) }))
})

router.patch("/:id/status", async (req, res) => {
  const incidente = await IncidenteSistema.findByPk(req.params.id)
  if (!incidente) return res.status(404).json({ message: "Incidente não encontrado." })
  const status = ["Aberto", "Em diagnóstico", "Corrigido", "Ignorado"].includes(req.body.status) ? req.body.status : "Aberto"
  await incidente.update({ status, diagnostico: req.body.diagnostico ?? incidente.diagnostico, correcao: req.body.correcao ?? incidente.correcao, resolvidoEm: status === "Corrigido" ? new Date() : null })
  res.json(incidente)
})

module.exports = router

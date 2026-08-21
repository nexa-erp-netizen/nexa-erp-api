const express = require("express")
const { Op } = require("sequelize")
const AcessoCliente = require("../models/AcessoCliente")
const Cliente = require("../models/Cliente")
const { capturarExcecaoRota } = require("../middlewares/incidenteMiddleware")
const router = express.Router()

const normalizar = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()

async function clienteDoUsuario(req) {
  if (req.usuario.perfil !== "Cliente") return null
  const nome = normalizar(req.usuario.clienteVinculado || req.usuario.nome)
  const clientes = await Cliente.findAll({ attributes: ["id", "nome"] })
  return clientes.find((item) => normalizar(item.nome) === nome) || null
}

router.post("/atividade", async (req, res) => {
  try {
    if (req.usuario.perfil !== "Cliente") return res.status(204).end()
    const cliente = await clienteDoUsuario(req)
    const tipo = String(req.body.tipo || "atividade").slice(0, 40)
    const agora = new Date()

    // Heartbeats são consolidados para não criar milhares de linhas.
    if (tipo === "heartbeat") {
      const recente = await AcessoCliente.findOne({
        where: { usuarioId: req.usuario.id, tipo, createdAt: { [Op.gte]: new Date(agora.getTime() - 4 * 60 * 1000) } },
        order: [["createdAt", "DESC"]],
      })
      if (recente) {
        await recente.update({ pagina: req.body.pagina || recente.pagina, descricao: "Atividade no Portal" })
        return res.json({ ok: true })
      }
    }

    await AcessoCliente.create({
      usuarioId: req.usuario.id,
      clienteId: cliente?.id || null,
      clienteNome: cliente?.nome || req.usuario.clienteVinculado || req.usuario.nome,
      tipo,
      pagina: String(req.body.pagina || "Portal Cliente").slice(0, 120),
      recurso: req.body.recurso ? String(req.body.recurso).slice(0, 120) : null,
      recursoId: req.body.recursoId ? String(req.body.recursoId).slice(0, 120) : null,
      descricao: req.body.descricao ? String(req.body.descricao).slice(0, 255) : null,
      ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim().slice(0, 80),
      dispositivo: String(req.headers["user-agent"] || "").slice(0, 255),
      escritorioId: req.usuario.escritorioId,
    })
    res.status(201).json({ ok: true })
  } catch (error) {
    console.error("ERRO AO REGISTRAR ACESSO DO CLIENTE:", error)
    await capturarExcecaoRota({ error, req, res, titulo: "Falha ao registrar acesso do cliente", componente: "acessosClientesRoutes/atividade" })
    res.status(500).json({ message: "Erro ao registrar atividade" })
  }
})

router.get("/", async (req, res) => {
  try {
    if (!['Administrador', 'Funcionário'].includes(req.usuario.perfil)) return res.status(403).json({ message: "Acesso não autorizado" })
    const where = {}
    if (req.query.clienteId) where.clienteId = req.query.clienteId
    if (req.query.usuarioId) where.usuarioId = req.query.usuarioId
    const eventos = await AcessoCliente.findAll({ where, order: [["updatedAt", "DESC"]], limit: Math.min(Number(req.query.limite) || 100, 300) })
    const limiteOnline = Date.now() - 5 * 60 * 1000
    res.json(eventos.map((item) => ({ ...item.toJSON(), online: new Date(item.updatedAt || item.createdAt).getTime() >= limiteOnline })))
  } catch (error) {
    console.error("ERRO AO LISTAR ACESSOS:", error)
    await capturarExcecaoRota({ error, req, res, titulo: "Falha ao listar acessos do cliente", componente: "acessosClientesRoutes/listar" })
    res.status(500).json({ message: "Erro ao listar acessos" })
  }
})

module.exports = router

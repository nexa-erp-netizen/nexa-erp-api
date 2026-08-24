const express = require("express")
const { Op } = require("sequelize")
const { autenticar, autorizarPerfis } = require("../middlewares/authMiddleware")
const IncidenteSistema = require("../models/IncidenteSistema")
const PlanoCorrecaoNexa = require("../models/PlanoCorrecaoNexa")
const ExecucaoAgenteNexa = require("../models/ExecucaoAgenteNexa")
const { version: NEXA_API_VERSION } = require("../../package.json")

const router = express.Router()
router.use(autenticar, autorizarPerfis("Administrador"))

function textoSeguro(valor, limite = 2000) {
  return String(valor || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REMOVIDO]")
    .replace(/(senha|password|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REMOVIDO]")
    .slice(0, limite)
}

function limparObjeto(valor, profundidade = 0) {
  if (profundidade > 4 || valor == null) return valor
  if (Array.isArray(valor)) return valor.slice(0, 50).map((item) => limparObjeto(item, profundidade + 1))
  if (typeof valor !== "object") return typeof valor === "string" ? textoSeguro(valor) : valor
  return Object.fromEntries(Object.entries(valor).map(([chave, item]) => {
    if (/senha|password|secret|token|api.?key|authorization|cookie/i.test(chave)) return [chave, "[REMOVIDO]"]
    return [chave, limparObjeto(item, profundidade + 1)]
  }))
}

router.post("/pacote", async (req, res) => {
  try {
    const descricao = textoSeguro(req.body?.descricao, 3000)
    const incidenteId = req.body?.incidenteId ? Number(req.body.incidenteId) : null
    const whereIncidente = { escritorioId: req.usuario.escritorioId }
    if (Number.isInteger(incidenteId)) whereIncidente.id = incidenteId
    else whereIncidente.status = { [Op.notIn]: ["Resolvido", "Ignorado"] }

    const [incidentes, planos, execucoes] = await Promise.all([
      IncidenteSistema.findAll({ where: whereIncidente, order: [["ultimaOcorrenciaEm", "DESC"]], limit: 20 }),
      PlanoCorrecaoNexa.findAll({ where: { escritorioId: req.usuario.escritorioId }, order: [["createdAt", "DESC"]], limit: 10 }),
      ExecucaoAgenteNexa.findAll({ where: { escritorioId: req.usuario.escritorioId }, order: [["createdAt", "DESC"]], limit: 10 }),
    ])

    const pacote = {
      formato: "nexa-diagnostico-chatgpt",
      versaoFormato: 1,
      geradoEm: new Date().toISOString(),
      sistema: { produto: "Nexa ERP", versaoApi: NEXA_API_VERSION, ambiente: process.env.NODE_ENV || "production" },
      solicitacao: descricao || "Analisar os incidentes e propor uma correção segura.",
      regras: [
        "Diagnosticar a causa antes de alterar dados.",
        "Não executar exclusões nem alterações financeiras automaticamente.",
        "Preparar correção, testes e rollback para aprovação do Administrador.",
      ],
      incidentes: incidentes.map((item) => limparObjeto(item.toJSON())),
      planosRecentes: planos.map((item) => limparObjeto(item.toJSON())),
      execucoesRecentes: execucoes.map((item) => limparObjeto(item.toJSON())),
      observacao: "Credenciais, tokens e segredos foram removidos automaticamente.",
    }

    const nome = `diagnostico-nexa-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    res.set({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    })
    return res.send(JSON.stringify(pacote, null, 2))
  } catch (error) {
    console.error("ERRO AO GERAR PACOTE DE DIAGNÓSTICO:", error)
    return res.status(500).json({ message: "Não foi possível preparar o diagnóstico." })
  }
})

module.exports = router

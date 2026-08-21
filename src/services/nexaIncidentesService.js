function normalizar(texto) { return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }

function pareceConsultaIncidentes(mensagem) {
  const texto = normalizar(mensagem)
  return /\b(erro|erros|falha|falhas|incidente|incidentes|problema|problemas)\b/.test(texto)
    && /\b(sistema|nexa|api|web|aconteceu|ocorreu|aberto|recent|hoje|tem|teve|verific|mostr|diagnostic)\b/.test(texto)
}

async function consultarIncidentesPelaNexa({ mensagem, usuario }) {
  if (!pareceConsultaIncidentes(mensagem)) return null
  if (usuario?.perfil !== "Administrador") return { resposta: "A consulta técnica de incidentes é restrita ao administrador.", modo: "nexa-incidentes-bloqueado" }
  const IncidenteSistema = require("../models/IncidenteSistema")
  const incidentes = await IncidenteSistema.findAll({ where: { status: "Aberto" }, order: [["ultimaOcorrenciaEm", "DESC"]], limit: 10 })
  if (!incidentes.length) return { resposta: "Não há incidentes abertos registrados no momento.", modo: "nexa-incidentes", atividade: "autodiagnostico", incidentes: [] }
  const resumo = incidentes.map(item => `#${item.id} ${item.origem.toUpperCase()} — ${item.titulo} (${item.ocorrencias} ocorrência${Number(item.ocorrencias) === 1 ? "" : "s"})`).join("; ")
  return {
    resposta: `Encontrei ${incidentes.length} incidente(s) aberto(s). ${resumo}. Posso detalhar um deles pelo número.`,
    modo: "nexa-incidentes", atividade: "autodiagnostico", provedor: "sistema", modelo: "Nexa Dev 1.0",
    incidentes: incidentes.map(item => ({ id: item.id, origem: item.origem, nivel: item.nivel, titulo: item.titulo, ocorrencias: item.ocorrencias, ultimaOcorrenciaEm: item.ultimaOcorrenciaEm })),
  }
}

module.exports = { consultarIncidentesPelaNexa, pareceConsultaIncidentes }

function normalizar(texto) { return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }
const { diagnosticarIncidente } = require("./motorDiagnosticoIncidenteService")

async function garantirDiagnostico(item) {
  if (!item || item.categoria) return item
  const resultado = diagnosticarIncidente(item.toJSON ? item.toJSON() : item)
  await item.update({ diagnostico: resultado.causaProvavel, categoria: resultado.categoria, causaProvavel: resultado.causaProvavel, correcaoSugerida: resultado.correcaoSugerida, risco: resultado.risco, confiancaDiagnostico: resultado.confianca, autocorrecaoPermitida: resultado.autocorrecaoPermitida, codigoCorrecao: resultado.codigoCorrecao || null })
  return item
}

function pareceConsultaIncidentes(mensagem) {
  const texto = normalizar(mensagem)
  if (/(?:incidente|erro|falha)?\s*#\s*\d+/.test(texto)) return true
  return /\b(erro|erros|falha|falhas|incidente|incidentes|problema|problemas)\b/.test(texto)
    && /\b(sistema|nexa|api|web|aconteceu|ocorreu|aberto|recent|hoje|tem|teve|verific|mostr|diagnostic)\b/.test(texto)
}

async function consultarIncidentesPelaNexa({ mensagem, usuario }) {
  if (!pareceConsultaIncidentes(mensagem)) return null
  if (usuario?.perfil !== "Administrador") return { resposta: "A consulta técnica de incidentes é restrita ao administrador.", modo: "nexa-incidentes-bloqueado" }
  const IncidenteSistema = require("../models/IncidenteSistema")
  const idSolicitado = normalizar(mensagem).match(/(?:incidente|erro|falha)?\s*#\s*(\d+)/)?.[1]
  if (idSolicitado) {
    const item = await IncidenteSistema.findByPk(Number(idSolicitado))
    if (!item) return { resposta: `Não encontrei o incidente #${idSolicitado}.`, modo: "nexa-incidentes" }
    const texto = normalizar(mensagem)
    if (/\b(reabra|reabrir|abra novamente|reative|reativar)\b/.test(texto)) {
      await item.update({ status: "Aberto", resolvidoEm: null, reaberturas: Number(item.reaberturas || 0) + 1, ultimaValidacaoEm: new Date(), resultadoValidacao: { estado: "reaberto-manualmente", usuarioId: usuario.id } })
      return { resposta: `Incidente #${item.id} reaberto. Se a falha ocorrer novamente, a Nexa acrescentará a nova evidência ao mesmo incidente.`, modo: "nexa-incidente-reaberto", incidente: item }
    }
    if (/\b(encerre|encerrar|feche|fechar|ignore|ignorar|arquive|arquivar|marque como corrigido|marcar como corrigido|resolvido)\b/.test(texto)) {
      const corrigido = /\b(corrigido|resolvido|funcionando|corrigida|resolvida)\b/.test(texto)
      const status = corrigido ? "Corrigido" : "Ignorado"
      const motivo = corrigido ? "Validação informada pelo administrador: funcionamento normal." : "Falha temporária encerrada pelo administrador."
      await item.update({ status, resolvidoEm: new Date(), correcao: motivo, tipoFalha: corrigido ? item.tipoFalha : "Temporária", ultimaValidacaoEm: new Date(), resultadoValidacao: { estado: corrigido ? "validado-com-sucesso" : "falha-temporaria", usuarioId: usuario.id } })
      return { resposta: `Incidente #${item.id} encerrado como ${status.toLowerCase()}. Se a mesma falha voltar, ele será reaberto automaticamente.`, modo: "nexa-incidente-encerrado", incidente: item }
    }
    await garantirDiagnostico(item)
    return {
      resposta: `Incidente #${item.id}: ${item.titulo}. Tipo: ${item.tipoFalha || "em observação"}. Categoria: ${item.categoria || "não classificada"}. Causa provável: ${item.causaProvavel || item.diagnostico || "ainda não determinada"}. Correção sugerida: ${item.correcaoSugerida || "requer análise técnica"}. Risco ${String(item.risco || "médio").toLowerCase()}, confiança de ${item.confiancaDiagnostico || 0}%. ${item.autocorrecaoPermitida ? "A correção está classificada como automatizável, mas ainda será validada antes da execução." : "A alteração exige laboratório e testes antes de qualquer execução."}`,
      modo: "nexa-incidente-detalhado", atividade: "autodiagnostico", provedor: "sistema", modelo: "Nexa Dev Diagnóstico 1.0",
      incidente: item,
    }
  }
  const incidentes = await IncidenteSistema.findAll({ where: { status: "Aberto" }, order: [["ultimaOcorrenciaEm", "DESC"]], limit: 10 })
  await Promise.all(incidentes.map(garantirDiagnostico))
  if (!incidentes.length) return { resposta: "Não há incidentes abertos registrados no momento.", modo: "nexa-incidentes", atividade: "autodiagnostico", incidentes: [] }
  const resumo = incidentes.map(item => `#${item.id} ${item.origem.toUpperCase()} — ${item.titulo} • ${item.categoria || "aguardando classificação"} (${item.ocorrencias} ocorrência${Number(item.ocorrencias) === 1 ? "" : "s"})`).join("; ")
  return {
    resposta: `Encontrei ${incidentes.length} incidente(s) aberto(s). ${resumo}. Para ver causa, risco e correção, diga por exemplo: detalhe o incidente #1.`,
    modo: "nexa-incidentes", atividade: "autodiagnostico", provedor: "sistema", modelo: "Nexa Dev 1.0",
    incidentes: incidentes.map(item => ({ id: item.id, origem: item.origem, nivel: item.nivel, titulo: item.titulo, ocorrencias: item.ocorrencias, ultimaOcorrenciaEm: item.ultimaOcorrenciaEm })),
  }
}

module.exports = { consultarIncidentesPelaNexa, pareceConsultaIncidentes }

const crypto = require("crypto")
const { diagnosticarIncidente } = require("./motorDiagnosticoIncidenteService")

const CHAVES_SENSIVEIS = /senha|password|token|authorization|cookie|secret|chave|credential|certificado|cpf|cnpj/i

function textoSeguro(valor, limite = 1500) {
  return String(valor || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [PROTEGIDO]")
    .replace(/\b\d{11,14}\b/g, "[DOCUMENTO PROTEGIDO]")
    .slice(0, limite)
}

function sanear(valor, profundidade = 0) {
  if (profundidade > 3 || valor == null) return valor == null ? null : "[LIMITE]"
  if (Array.isArray(valor)) return valor.slice(0, 20).map(item => sanear(item, profundidade + 1))
  if (typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).slice(0, 40).map(([chave, item]) => [
      chave,
      CHAVES_SENSIVEIS.test(chave) ? "[PROTEGIDO]" : sanear(item, profundidade + 1),
    ]))
  }
  return typeof valor === "string" ? textoSeguro(valor) : valor
}

function fingerprint(dados) {
  const base = [dados.origem, dados.metodo, dados.rota, dados.statusHttp, dados.componente, textoSeguro(dados.mensagem, 300)].join("|").toLowerCase()
  return crypto.createHash("sha256").update(base).digest("hex")
}

function nivelDoIncidente(statusHttp, origem) {
  if (Number(statusHttp) >= 500 || origem === "web-runtime") return "Crítico"
  if (Number(statusHttp) >= 400) return "Erro"
  return "Alerta"
}

function tipoFalha(dados, diagnostico, ocorrencias = 1) {
  const texto = `${dados?.mensagem || ""} ${diagnostico?.categoria || ""}`.toLowerCase()
  if (ocorrencias > 1) return "Persistente"
  if (/timeout|tempo de resposta|conex[aã]o|econn|temporar|rate limit|429/.test(texto)) return "Temporária"
  if (/banco de dados|constraint|column|relation|interface web|falha interna/.test(texto)) return "Persistente"
  return "Em observação"
}

async function registrarIncidente(dados) {
  const IncidenteSistema = require("../models/IncidenteSistema")
  const agora = new Date()
  const diagnostico = diagnosticarIncidente(dados)
  const entrada = {
    fingerprint: fingerprint(dados), origem: textoSeguro(dados.origem, 20) || "api",
    nivel: dados.nivel || nivelDoIncidente(dados.statusHttp, dados.origem), status: "Aberto",
    titulo: textoSeguro(dados.titulo || dados.mensagem || "Erro não identificado", 250),
    mensagem: textoSeguro(dados.mensagem), rota: textoSeguro(dados.rota, 500),
    metodo: textoSeguro(dados.metodo, 10), statusHttp: Number(dados.statusHttp) || null,
    componente: textoSeguro(dados.componente, 200), contexto: sanear(dados.contexto),
    usuarioId: Number(dados.usuarioId) || null, clienteId: Number(dados.clienteId) || null,
    versaoWeb: textoSeguro(dados.versaoWeb, 30), versaoApi: textoSeguro(dados.versaoApi, 30) || "3.37.1",
    primeiraOcorrenciaEm: agora, ultimaOcorrenciaEm: agora,
    diagnostico: diagnostico.causaProvavel, categoria: diagnostico.categoria,
    causaProvavel: diagnostico.causaProvavel, correcaoSugerida: diagnostico.correcaoSugerida,
    risco: diagnostico.risco, confiancaDiagnostico: diagnostico.confianca,
    autocorrecaoPermitida: diagnostico.autocorrecaoPermitida,
    codigoCorrecao: diagnostico.codigoCorrecao || null,
    tipoFalha: tipoFalha(dados, diagnostico),
  }
  const existente = await IncidenteSistema.findOne({ where: { fingerprint: entrada.fingerprint, status: { [require("sequelize").Op.in]: ["Aberto", "Em diagnóstico"] } } })
  if (existente) {
    const ocorrencias = Number(existente.ocorrencias || 1) + 1
    await existente.update({ ocorrencias, ultimaOcorrenciaEm: agora, contexto: entrada.contexto, usuarioId: entrada.usuarioId || existente.usuarioId, clienteId: entrada.clienteId || existente.clienteId, diagnostico: entrada.diagnostico, categoria: entrada.categoria, causaProvavel: entrada.causaProvavel, correcaoSugerida: entrada.correcaoSugerida, risco: entrada.risco, confiancaDiagnostico: entrada.confiancaDiagnostico, autocorrecaoPermitida: entrada.autocorrecaoPermitida, codigoCorrecao: entrada.codigoCorrecao, tipoFalha: tipoFalha(dados, diagnostico, ocorrencias), ultimaValidacaoEm: agora, resultadoValidacao: { estado: "falha-repetida", ocorrencias } })
    return existente
  }
  const genericoDaMesmaRota = await IncidenteSistema.findOne({
    where: {
      origem: entrada.origem,
      metodo: entrada.metodo,
      rota: entrada.rota,
      status: { [require("sequelize").Op.in]: ["Aberto", "Em diagnóstico"] },
      mensagem: "A API respondeu com erro interno.",
    },
    order: [["ultimaOcorrenciaEm", "DESC"]],
  })
  if (genericoDaMesmaRota) {
    await genericoDaMesmaRota.update({ ...entrada, primeiraOcorrenciaEm: genericoDaMesmaRota.primeiraOcorrenciaEm, ocorrencias: genericoDaMesmaRota.ocorrencias, status: genericoDaMesmaRota.status, tipoFalha: tipoFalha(dados, diagnostico, genericoDaMesmaRota.ocorrencias), ultimaValidacaoEm: agora, resultadoValidacao: { estado: "causa-original-capturada" } })
    return genericoDaMesmaRota
  }
  const genericoEncerradoDaMesmaRota = await IncidenteSistema.findOne({
    where: {
      origem: entrada.origem,
      metodo: entrada.metodo,
      rota: entrada.rota,
      status: { [require("sequelize").Op.in]: ["Corrigido", "Ignorado"] },
      mensagem: "A API respondeu com erro interno.",
    },
    order: [["ultimaOcorrenciaEm", "DESC"]],
  })
  if (genericoEncerradoDaMesmaRota) {
    const ocorrencias = Number(genericoEncerradoDaMesmaRota.ocorrencias || 1) + 1
    await genericoEncerradoDaMesmaRota.update({ ...entrada, status: "Aberto", primeiraOcorrenciaEm: genericoEncerradoDaMesmaRota.primeiraOcorrenciaEm, ocorrencias, reaberturas: Number(genericoEncerradoDaMesmaRota.reaberturas || 0) + 1, resolvidoEm: null, tipoFalha: "Persistente", ultimaValidacaoEm: agora, resultadoValidacao: { estado: "reaberto-com-causa-original", ocorrencias } })
    return genericoEncerradoDaMesmaRota
  }
  const encerrado = await IncidenteSistema.findOne({ where: { fingerprint: entrada.fingerprint, status: { [require("sequelize").Op.in]: ["Corrigido", "Ignorado"] } }, order: [["ultimaOcorrenciaEm", "DESC"]] })
  if (encerrado) {
    const ocorrencias = Number(encerrado.ocorrencias || 1) + 1
    await encerrado.update({ ...entrada, status: "Aberto", ocorrencias, primeiraOcorrenciaEm: encerrado.primeiraOcorrenciaEm, reaberturas: Number(encerrado.reaberturas || 0) + 1, resolvidoEm: null, tipoFalha: "Persistente", ultimaValidacaoEm: agora, resultadoValidacao: { estado: "reaberto-automaticamente", ocorrencias } })
    return encerrado
  }
  return IncidenteSistema.create(entrada)
}

module.exports = { fingerprint, nivelDoIncidente, registrarIncidente, sanear, textoSeguro, tipoFalha }

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
    versaoWeb: textoSeguro(dados.versaoWeb, 30), versaoApi: textoSeguro(dados.versaoApi, 30) || "3.37.0",
    primeiraOcorrenciaEm: agora, ultimaOcorrenciaEm: agora,
    diagnostico: diagnostico.causaProvavel, categoria: diagnostico.categoria,
    causaProvavel: diagnostico.causaProvavel, correcaoSugerida: diagnostico.correcaoSugerida,
    risco: diagnostico.risco, confiancaDiagnostico: diagnostico.confianca,
    autocorrecaoPermitida: diagnostico.autocorrecaoPermitida,
    codigoCorrecao: diagnostico.codigoCorrecao || null,
  }
  const existente = await IncidenteSistema.findOne({ where: { fingerprint: entrada.fingerprint, status: "Aberto" } })
  if (existente) {
    await existente.update({ ocorrencias: Number(existente.ocorrencias || 1) + 1, ultimaOcorrenciaEm: agora, contexto: entrada.contexto, usuarioId: entrada.usuarioId || existente.usuarioId, clienteId: entrada.clienteId || existente.clienteId, diagnostico: entrada.diagnostico, categoria: entrada.categoria, causaProvavel: entrada.causaProvavel, correcaoSugerida: entrada.correcaoSugerida, risco: entrada.risco, confiancaDiagnostico: entrada.confiancaDiagnostico, autocorrecaoPermitida: entrada.autocorrecaoPermitida, codigoCorrecao: entrada.codigoCorrecao })
    return existente
  }
  return IncidenteSistema.create(entrada)
}

module.exports = { fingerprint, nivelDoIncidente, registrarIncidente, sanear, textoSeguro }

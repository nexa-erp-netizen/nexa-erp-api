const { registrarIncidente } = require("../services/incidenteSistemaService")
const crypto = require("crypto")

function monitorarRespostas(req, res, next) {
  const correlacaoId = String(req.headers["x-correlation-id"] || crypto.randomUUID()).slice(0, 80)
  req.correlacaoId = correlacaoId
  res.setHeader("X-Correlation-Id", correlacaoId)
  res.on("finish", () => {
    if (res.statusCode < 500 || req.path.startsWith("/incidentes") || res.locals.incidenteRegistrado) return
    registrarIncidente({
      origem: "api", titulo: `Falha ${res.statusCode} em ${req.method} ${req.originalUrl}`,
      mensagem: "A API respondeu com erro interno.", rota: req.originalUrl, metodo: req.method,
      statusHttp: res.statusCode, usuarioId: req.usuario?.id, clienteId: req.body?.clienteId || req.query?.clienteId,
      contexto: { correlacaoId, parametros: req.params, consulta: req.query },
    }).catch(error => console.warn("INCIDENTE NÃO REGISTRADO:", error?.message || error))
  })
  next()
}

async function capturarExcecaoRota({ error, req, res, titulo, componente }) {
  res.locals.incidenteRegistrado = true
  try {
    return await registrarIncidente({
      origem: "api",
      titulo: titulo || error?.name || "Erro capturado na API",
      mensagem: error?.message,
      rota: req.originalUrl,
      metodo: req.method,
      statusHttp: error?.statusCode || 500,
      componente: componente || error?.stack?.split("\n")?.[1],
      usuarioId: req.usuario?.id,
      clienteId: req.body?.clienteId || req.query?.clienteId,
      contexto: { correlacaoId: req.correlacaoId, nomeErro: error?.name, codigoErro: error?.code },
    })
  } catch (registroErro) {
    console.warn("CAUSA ORIGINAL NÃO REGISTRADA:", registroErro?.message || registroErro)
    return null
  }
}

function capturarErroGlobal(error, req, res, _next) {
  registrarIncidente({
    origem: "api", titulo: error?.name || "Erro interno da API", mensagem: error?.message,
    rota: req.originalUrl, metodo: req.method, statusHttp: error?.statusCode || 500,
    componente: error?.stack?.split("\n")?.[1], usuarioId: req.usuario?.id,
    clienteId: req.body?.clienteId || req.query?.clienteId,
    contexto: { correlacaoId: req.correlacaoId },
  }).catch(registroErro => console.warn("INCIDENTE NÃO REGISTRADO:", registroErro?.message || registroErro))
  if (res.headersSent) return
  res.status(error?.statusCode || 500).json({ message: "Ocorreu um erro interno. A Nexa já registrou o incidente para diagnóstico." })
}

module.exports = { capturarErroGlobal, monitorarRespostas, capturarExcecaoRota }

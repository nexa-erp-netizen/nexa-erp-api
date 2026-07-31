const express = require("express")
const AuditoriaIntegracaoChatGPT = require("../models/AuditoriaIntegracaoChatGPT")
const { autenticarIntegracaoChatGPT } = require("../middlewares/chatgptIntegrationAuth")
const { detectarConsultaInteligente } = require("../services/consultaInteligenteService")
const {
  buscarDocumentosChatGPT,
  baixarDocumentoChatGPT,
} = require("../services/chatgptDocumentosService")

const router = express.Router()
router.use(autenticarIntegracaoChatGPT)

const ferramentas = [
  {
    name: "consultar_nexa",
    description: "Consulta dados do Nexa ERP em modo somente leitura.",
    inputSchema: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "Pergunta objetiva em português." },
        clienteId: { type: "integer", description: "ID exato do cliente, quando já confirmado." },
      },
      required: ["pergunta"],
      additionalProperties: false,
    },
  },
  {
    name: "listar_prioridades_nexa",
    description: "Lista as prioridades atuais do escritório no Nexa ERP.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "listar_pendencias_nexa",
    description: "Lista todas as pendências reais ou restringe ao clienteId confirmado.",
    inputSchema: {
      type: "object",
      properties: { clienteId: { type: "integer", description: "ID exato e confirmado do cliente." } },
      additionalProperties: false,
    },
  },
]

function sanitizarParametros(valor) {
  const copia = { ...(valor || {}) }
  if (copia.pergunta) copia.pergunta = String(copia.pergunta).slice(0, 500)
  return copia
}

async function executarFerramenta(nome, args, usuario) {
  if (nome === "consultar_nexa") {
    return detectarConsultaInteligente({ mensagem: args.pergunta, clienteId: args.clienteId || null, usuario })
  }
  if (nome === "listar_prioridades_nexa") {
    return detectarConsultaInteligente({ mensagem: "quais são as prioridades do escritório hoje?", usuario, intencaoForcada: "prioridades-hoje" })
  }
  if (nome === "listar_pendencias_nexa") {
    return detectarConsultaInteligente({
      mensagem: args.clienteId ? "quais são todas as pendências desse cliente?" : "quais são todas as pendências dos clientes?",
      clienteId: args.clienteId || null,
      usuario,
      intencaoForcada: "pendencias-gerais",
    })
  }
  throw Object.assign(new Error("Ferramenta desconhecida"), { mcpCode: -32601 })
}

function textoResultado(resultado) {
  return resultado?.resposta || resultado?.fala || "Consulta concluída."
}

async function responderRest(req, res, nome, args) {
  const inicio = Date.now()
  let sucesso = false
  let erro = null
  try {
    const resultado = await executarFerramenta(nome, sanitizarParametros(args), req.usuario)
    if (!resultado) return res.status(404).json({ ok: false, resposta: "A Nexa não reconheceu essa consulta." })
    sucesso = true
    return res.json({ ok: true, resposta: textoResultado(resultado), dados: resultado })
  } catch (e) {
    erro = e
    return res.status(500).json({ ok: false, resposta: "Falha ao consultar a Nexa." })
  } finally {
    AuditoriaIntegracaoChatGPT.create({
      ferramenta: nome,
      parametros: sanitizarParametros(args),
      sucesso,
      statusHttp: res.statusCode,
      duracaoMs: Date.now() - inicio,
      usuarioId: req.usuario?.id || null,
      empresaId: req.usuario?.empresaId || null,
      ip: req.ip || null,
      erro: erro ? String(erro.message || erro).slice(0, 1000) : null,
    }).catch((auditError) => console.error("Falha ao auditar integração ChatGPT:", auditError.message))
  }
}

router.post("/consulta", (req, res) => {
  const pergunta = String(req.body?.pergunta || "").trim()
  if (!pergunta) return res.status(400).json({ ok: false, resposta: "A pergunta é obrigatória." })
  return responderRest(req, res, "consultar_nexa", { pergunta, clienteId: req.body?.clienteId || null })
})

router.get("/prioridades", (req, res) => responderRest(req, res, "listar_prioridades_nexa", {}))

router.get("/pendencias", (req, res) => {
  const clienteId = req.query?.clienteId ? Number(req.query.clienteId) : null
  if (req.query?.clienteId && !Number.isInteger(clienteId)) {
    return res.status(400).json({ ok: false, resposta: "clienteId inválido." })
  }
  return responderRest(req, res, "listar_pendencias_nexa", { clienteId })
})

router.get("/documentos", async (req, res) => {
  const inicio = Date.now()
  const parametros = {
    clienteId: req.query?.clienteId ? Number(req.query.clienteId) : null,
    busca: String(req.query?.busca || "").trim().slice(0, 200),
  }
  let sucesso = false
  let erro = null
  try {
    const resultado = await buscarDocumentosChatGPT({
      usuarioId: req.usuario.id,
      clienteId: parametros.clienteId,
      busca: parametros.busca,
    })
    sucesso = true
    return res.json({ ok: true, ...resultado })
  } catch (e) {
    erro = e
    return res.status(e.status || 500).json({ ok: false, resposta: e.message || "Falha ao localizar documentos." })
  } finally {
    AuditoriaIntegracaoChatGPT.create({
      ferramenta: "buscar_documentos_drive",
      parametros,
      sucesso,
      statusHttp: res.statusCode,
      duracaoMs: Date.now() - inicio,
      usuarioId: req.usuario?.id || null,
      empresaId: req.usuario?.empresaId || null,
      ip: req.ip || null,
      erro: erro ? String(erro.message || erro).slice(0, 1000) : null,
    }).catch((auditError) => console.error("Falha ao auditar integração ChatGPT:", auditError.message))
  }
})

router.get("/documentos/baixar", async (req, res) => {
  const inicio = Date.now()
  const parametros = {
    clienteId: req.query?.clienteId ? Number(req.query.clienteId) : null,
    arquivoId: String(req.query?.arquivoId || "").trim().slice(0, 200),
  }
  let sucesso = false
  let erro = null
  try {
    if (!parametros.arquivoId) return res.status(400).json({ ok: false, resposta: "arquivoId é obrigatório." })
    const resultado = await baixarDocumentoChatGPT({ usuarioId: req.usuario.id, ...parametros })
    sucesso = true
    return res.json({
      ok: true,
      resposta: `Documento de ${resultado.clienteNome} enviado com segurança.`,
      clienteId: resultado.clienteId,
      clienteNome: resultado.clienteNome,
      openaiFileResponse: [resultado.arquivo],
    })
  } catch (e) {
    erro = e
    return res.status(e.status || 500).json({ ok: false, resposta: e.message || "Falha ao enviar o documento." })
  } finally {
    AuditoriaIntegracaoChatGPT.create({
      ferramenta: "baixar_documento_drive",
      parametros,
      sucesso,
      statusHttp: res.statusCode,
      duracaoMs: Date.now() - inicio,
      usuarioId: req.usuario?.id || null,
      empresaId: req.usuario?.empresaId || null,
      ip: req.ip || null,
      erro: erro ? String(erro.message || erro).slice(0, 1000) : null,
    }).catch((auditError) => console.error("Falha ao auditar integração ChatGPT:", auditError.message))
  }
})

function respostaJson(id, result) { return { jsonrpc: "2.0", id, result } }
function erroJson(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } } }

router.post("/mcp", async (req, res) => {
  const inicio = Date.now()
  const { id, method, params = {} } = req.body || {}
  let ferramenta = method
  let args = {}
  let sucesso = false
  let erro = null
  try {
    if (method === "initialize") {
      sucesso = true
      return res.json(respostaJson(id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "nexa-erp-readonly", version: "1.1.0" } }))
    }
    if (method === "notifications/initialized") return res.status(202).end()
    if (method === "ping") {
      sucesso = true
      return res.json(respostaJson(id, {}))
    }
    if (method === "tools/list") {
      sucesso = true
      return res.json(respostaJson(id, { tools: ferramentas }))
    }
    if (method !== "tools/call") return res.status(400).json(erroJson(id, -32601, "Método não suportado"))
    ferramenta = String(params.name || "")
    args = sanitizarParametros(params.arguments)
    if (ferramenta === "consultar_nexa" && !String(args.pergunta || "").trim()) {
      return res.status(400).json(erroJson(id, -32602, "A pergunta é obrigatória"))
    }
    const resultado = await executarFerramenta(ferramenta, args, req.usuario)
    sucesso = true
    return res.json(respostaJson(id, { content: [{ type: "text", text: textoResultado(resultado) }], structuredContent: resultado }))
  } catch (e) {
    erro = e
    return res.status(500).json(erroJson(id, e.mcpCode || -32603, "Falha ao consultar a Nexa"))
  } finally {
    AuditoriaIntegracaoChatGPT.create({
      ferramenta,
      parametros: sanitizarParametros(args),
      sucesso,
      statusHttp: res.statusCode,
      duracaoMs: Date.now() - inicio,
      usuarioId: req.usuario?.id || null,
      empresaId: req.usuario?.empresaId || null,
      ip: req.ip || null,
      erro: erro ? String(erro.message || erro).slice(0, 1000) : null,
    }).catch((auditError) => console.error("Falha ao auditar integração ChatGPT:", auditError.message))
  }
})

router.get("/status", (req, res) => res.json({ ok: true, modo: "somente-leitura", usuario: req.usuario.email }))

module.exports = router

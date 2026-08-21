const crypto = require("crypto")
const Cliente = require("../models/Cliente")
const Usuario = require("../models/Usuario")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const IncidenteSistema = require("../models/IncidenteSistema")
const MelhoriaNexa = require("../models/MelhoriaNexa")

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODELO = process.env.GROQ_PRODUCT_MODEL || "qwen/qwen3.6-27b"

const MODULOS = [
  "Dashboard", "Central do Cliente", "Fiscal", "Financeiro do Escritório",
  "Movimentos do Cliente", "Lançamentos Contábeis e DRE", "Documentos Digitais",
  "Agenda e Assistente do Dia", "WhatsApp Inteligente", "Certificados e e-CAC",
  "Conciliação Bancária", "Funcionários, Folha, Pró-labore, Férias e Rescisão",
  "Relatórios", "Nexa Assist e Nexa Voice", "NFS-e, NF-e e integrações",
]

function parecePedidoAnaliseProduto(mensagem) {
  const texto = String(mensagem || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const alvo = /\b(sistema|nexa|erp|produto|plataforma|modulos?)\b/.test(texto)
  const avaliacao = /\b(o que (?:voce )?acha|o que achou|avali|analis|melhor|ideia|sugest|opinia|parecer|acrescent|adicionar|retirar|remover|simplificar|mudaria|falta)\w*/.test(texto)
  return alvo && avaliacao
}

function normalizarNivel(valor, permitidos, padrao) {
  const encontrado = permitidos.find((item) => item.toLowerCase() === String(valor || "").toLowerCase())
  return encontrado || padrao
}

function fingerprint(item) {
  return crypto.createHash("sha256")
    .update(`${item.categoria}|${item.titulo}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())
    .digest("hex")
}

async function snapshotSistema() {
  const [clientes, usuarios, fiscais, financeiros, documentos, incidentesAbertos] = await Promise.all([
    Cliente.count(), Usuario.count(), Fiscal.count(), Financeiro.count(), DocumentoDigital.count(),
    IncidenteSistema.findAll({ where: { status: "Aberto" }, attributes: ["titulo", "categoria", "nivel", "ocorrencias", "componente"], order: [["ultimaOcorrenciaEm", "DESC"]], limit: 12 }),
  ])
  return {
    versao: "3.37.0",
    modulos: MODULOS,
    volumes: { clientes, usuarios, obrigacoesFiscais: fiscais, registrosFinanceiros: financeiros, documentos },
    incidentesAbertos: incidentesAbertos.map((item) => item.toJSON()),
  }
}

function respostaFormatada(resumo, itens) {
  const ordem = ["Manter", "Melhorar", "Acrescentar", "Remover/Unificar"]
  const blocos = ordem.map((categoria) => {
    const grupo = itens.filter((item) => item.categoria === categoria)
    if (!grupo.length) return ""
    return `${categoria}:\n${grupo.map((item) => `• ${item.titulo} — ${item.descricao} [Prioridade ${item.prioridade}; impacto ${item.impacto}; esforço ${item.esforco}]`).join("\n")}`
  }).filter(Boolean)
  return `${resumo}\n\n${blocos.join("\n\n")}`.trim()
}

async function salvarSugestoes(itens, contexto) {
  for (const item of itens) {
    const hash = fingerprint(item)
    const [registro, criado] = await MelhoriaNexa.findOrCreate({
      where: { fingerprint: hash },
      defaults: { ...item, fingerprint: hash, ...contexto, ultimaAnaliseEm: new Date() },
    })
    if (!criado && !["Aprovada", "Em execução", "Concluída", "Descartada"].includes(registro.status)) {
      await registro.update({ ...item, justificativa: item.justificativa || registro.justificativa, ultimaAnaliseEm: new Date() })
    }
  }
}

async function analisarProdutoPelaNexa({ mensagem, usuario, paginaAtual, clienteId }) {
  if (!parecePedidoAnaliseProduto(mensagem)) return null
  if (/\b(registrad|salv|central de melhorias|sugestoes existentes|melhorias existentes)\w*/i.test(String(mensagem))) {
    const existentes = await MelhoriaNexa.findAll({ where: { status: "Sugerida" }, order: [["ultimaAnaliseEm", "DESC"]], limit: 20 })
    const itens = existentes.map((item) => item.toJSON())
    return {
      resposta: itens.length ? respostaFormatada("Estas são as melhorias ainda aguardando avaliação:", itens) : "Não há melhorias aguardando avaliação no momento.",
      fala: itens.length ? `Há ${itens.length} melhorias aguardando avaliação. Organizei a lista na conversa.` : "Não há melhorias aguardando avaliação no momento.",
      melhorias: itens,
      atividade: "consulta-melhorias",
      provedor: "sistema",
      modelo: "Central de Melhorias Nexa 1.0",
    }
  }
  if (!process.env.GROQ_API_KEY) return { resposta: "A análise de produto está temporariamente indisponível.", providerFailure: true }

  const snapshot = await snapshotSistema()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90000)
  let resposta
  try {
    resposta = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODELO,
        reasoning_effort: "none",
        include_reasoning: false,
        temperature: 0.35,
        max_completion_tokens: 1700,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: `Você é a Nexa Analista de Produto do ERP contábil Nexa. Dê uma opinião própria, crítica e útil com base apenas no inventário e nos indicadores fornecidos. Não elogie por educação. Identifique o que manter, melhorar, acrescentar e remover ou unificar. Gere de 4 a 8 recomendações sem repetir ideias, priorizando redução de erros e trabalho manual. Retorne JSON válido: {"resumo":"opinião geral em até 3 frases","itens":[{"categoria":"Manter|Melhorar|Acrescentar|Remover/Unificar","titulo":"curto","descricao":"ação concreta","justificativa":"evidência","prioridade":"Crítica|Alta|Média|Baixa","impacto":"Alto|Médio|Baixo","esforco":"Alto|Médio|Baixo"}]}.\nPedido: ${String(mensagem).slice(0, 1200)}\nPágina atual: ${String(paginaAtual || "não informada").slice(0, 120)}\nDados do sistema: ${JSON.stringify(snapshot)}` }],
      }),
    })
  } finally {
    clearTimeout(timeout)
  }
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) throw new Error(dados?.error?.message || "Falha na análise de produto")
  const conteudo = JSON.parse(String(dados?.choices?.[0]?.message?.content || "{}"))
  const itens = (Array.isArray(conteudo.itens) ? conteudo.itens : []).slice(0, 8).map((item) => ({
    categoria: normalizarNivel(item.categoria, ["Manter", "Melhorar", "Acrescentar", "Remover/Unificar"], "Melhorar"),
    titulo: String(item.titulo || "Melhoria sugerida").trim().slice(0, 180),
    descricao: String(item.descricao || "").trim().slice(0, 1200),
    justificativa: String(item.justificativa || "").trim().slice(0, 1200),
    prioridade: normalizarNivel(item.prioridade, ["Crítica", "Alta", "Média", "Baixa"], "Média"),
    impacto: normalizarNivel(item.impacto, ["Alto", "Médio", "Baixo"], "Médio"),
    esforco: normalizarNivel(item.esforco, ["Alto", "Médio", "Baixo"], "Médio"),
  })).filter((item) => item.descricao)
  const resumo = String(conteudo.resumo || "Analisei o sistema e organizei as principais oportunidades.").trim().slice(0, 1200)
  await salvarSugestoes(itens, { origem: "conversa", pagina: paginaAtual || null, clienteId: clienteId || null, usuarioId: usuario.id })
  return { resposta: respostaFormatada(resumo, itens), fala: resumo, melhorias: itens, atividade: "analise-produto", provedor: "groq", modelo: MODELO }
}

module.exports = { analisarProdutoPelaNexa, parecePedidoAnaliseProduto }

const OPENAI_URL = "https://api.openai.com/v1/responses"
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6"
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b"
const PREFERRED = String(process.env.NEXA_AI_PROVIDER || "openai").toLowerCase()

function configured(provider) {
  return provider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.GROQ_API_KEY)
}

function providerOrder() {
  const first = PREFERRED === "groq" ? "groq" : "openai"
  return [first, first === "openai" ? "groq" : "openai"].filter(configured)
}

function extractOpenAI(data) {
  if (typeof data?.output_text === "string") return data.output_text.trim()
  return (Array.isArray(data?.output) ? data.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((item) => item?.text || item?.value || "")
    .filter(Boolean).join("\n").trim()
}

function extractGroq(data) {
  const content = data?.choices?.[0]?.message?.content
  return typeof content === "string" ? content.trim() : ""
}

async function callOpenAI(messages, options, signal) {
  const system = messages.filter((item) => item.role === "system").map((item) => item.content).join("\n\n")
  const input = messages.filter((item) => item.role !== "system").map((item) => ({
    role: item.role === "assistant" ? "assistant" : "user",
    content: String(item.content || ""),
  }))
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    signal,
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || OPENAI_MODEL,
      instructions: system || undefined,
      input,
      store: false,
      max_output_tokens: options.maxTokens || 900,
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || "low" },
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI respondeu com status ${response.status}`)
  const text = extractOpenAI(data)
  if (!text) throw new Error("A OpenAI não retornou uma resposta.")
  return { text, provider: "openai", model: data?.model || process.env.OPENAI_MODEL || OPENAI_MODEL }
}

async function callGroq(messages, options, signal) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    signal,
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || GROQ_MODEL,
      messages,
      temperature: options.temperature ?? 0.35,
      max_tokens: options.maxTokens || 900,
      ...(options.json ? { response_format: { type: "json_object" } } : {}),
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error?.message || `Groq respondeu com status ${response.status}`)
  const text = extractGroq(data)
  if (!text) throw new Error("A Groq não retornou uma resposta.")
  return { text, provider: "groq", model: data?.model || process.env.GROQ_MODEL || GROQ_MODEL }
}

async function generate(messages, options = {}) {
  const order = providerOrder()
  if (!order.length) {
    const error = new Error("Nenhum provedor de IA foi configurado. Configure OPENAI_API_KEY ou GROQ_API_KEY.")
    error.statusCode = 503
    error.providerFailure = true
    throw error
  }
  const failures = []
  for (const provider of order) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeout || 45000)
    try {
      return provider === "openai"
        ? await callOpenAI(messages, options, controller.signal)
        : await callGroq(messages, options, controller.signal)
    } catch (error) {
      failures.push(`${provider}: ${error?.name === "AbortError" ? "tempo esgotado" : error.message}`)
    } finally {
      clearTimeout(timeout)
    }
  }
  const error = new Error(failures.join(" | "))
  error.statusCode = 502
  error.providerFailure = true
  throw error
}

module.exports = {
  generate,
  configured,
  providerOrder,
  preferredProvider: PREFERRED,
  models: { openai: OPENAI_MODEL, groq: GROQ_MODEL },
  extractOpenAI,
  extractGroq,
}

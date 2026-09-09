const test = require("node:test")
const assert = require("node:assert/strict")

const aiProvider = require("../src/services/nexaAiProviderService")

test("preparação de código prioriza OpenAI e usa Groq como reserva", () => {
  const openaiAnterior = process.env.OPENAI_API_KEY
  const groqAnterior = process.env.GROQ_API_KEY
  process.env.OPENAI_API_KEY = "teste-openai"
  process.env.GROQ_API_KEY = "teste-groq"

  try {
    assert.deepEqual(aiProvider.providerOrderFor({ providerPriority: ["openai", "groq"] }), ["openai", "groq"])
  } finally {
    if (openaiAnterior === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = openaiAnterior
    if (groqAnterior === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = groqAnterior
  }
})

test("preparação de código continua disponível apenas com Groq configurada", () => {
  const openaiAnterior = process.env.OPENAI_API_KEY
  const groqAnterior = process.env.GROQ_API_KEY
  delete process.env.OPENAI_API_KEY
  process.env.GROQ_API_KEY = "teste-groq"

  try {
    assert.deepEqual(aiProvider.providerOrderFor({ providerPriority: ["openai", "groq"] }), ["groq"])
  } finally {
    if (openaiAnterior === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = openaiAnterior
    if (groqAnterior === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = groqAnterior
  }
})

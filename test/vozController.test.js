const test = require("node:test")
const assert = require("node:assert/strict")

const { statusVoz, transcreverVoz, _internals } = require("../src/controllers/vozController")

function respostaJson(status, dados, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nome) => headers[String(nome).toLowerCase()] || null },
    json: async () => dados,
  }
}

function mockRes() {
  return {
    statusCode: 200,
    corpo: null,
    status(valor) { this.statusCode = valor; return this },
    json(valor) { this.corpo = valor; return this },
  }
}

test("usa OpenAI quando o Groq atinge o limite", async (t) => {
  const fetchOriginal = global.fetch
  const groqOriginal = process.env.GROQ_API_KEY
  const openaiOriginal = process.env.OPENAI_API_KEY
  t.after(() => {
    global.fetch = fetchOriginal
    if (groqOriginal === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = groqOriginal
    if (openaiOriginal === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = openaiOriginal
  })

  process.env.GROQ_API_KEY = "teste-groq"
  process.env.OPENAI_API_KEY = "teste-openai"
  const urls = []
  global.fetch = async (url) => {
    urls.push(String(url))
    if (urls.length === 1) return respostaJson(429, { error: { message: "rate limit" } })
    return respostaJson(200, { text: "Bom dia, Nexa." }, { "x-request-id": "req_teste" })
  }

  const resultado = await _internals.transcreverComContingencia({
    arquivo: { buffer: Buffer.from("audio"), mimetype: "audio/webm" },
    prompt: "Nexa, DAS e e-CAC",
  })

  assert.equal(resultado.texto, "Bom dia, Nexa.")
  assert.equal(resultado.provedor, "openai")
  assert.match(urls[0], /api\.groq\.com/)
  assert.match(urls[1], /api\.openai\.com/)
})

test("não usa reserva em erro de áudio inválido", () => {
  assert.equal(_internals.podeUsarReservaOpenAI({ statusCode: 400 }), false)
  assert.equal(_internals.podeUsarReservaOpenAI({ statusCode: 429 }), true)
  assert.equal(_internals.podeUsarReservaOpenAI({ statusCode: 502 }), true)
})

test("status informa Groq principal e OpenAI de reserva", (t) => {
  const groqOriginal = process.env.GROQ_API_KEY
  const openaiOriginal = process.env.OPENAI_API_KEY
  t.after(() => {
    if (groqOriginal === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = groqOriginal
    if (openaiOriginal === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = openaiOriginal
  })
  process.env.GROQ_API_KEY = "teste-groq"
  process.env.OPENAI_API_KEY = "teste-openai"
  const res = mockRes()
  statusVoz({}, res)
  assert.equal(res.corpo.transcricaoDisponivel, true)
  assert.equal(res.corpo.transcricaoProvedor, "groq-whisper + openai")
  assert.equal(res.corpo.transcricaoReserva, "gpt-transcribe")
})

test("endpoint devolve o provedor realmente utilizado", async (t) => {
  const fetchOriginal = global.fetch
  const groqOriginal = process.env.GROQ_API_KEY
  const openaiOriginal = process.env.OPENAI_API_KEY
  t.after(() => {
    global.fetch = fetchOriginal
    if (groqOriginal === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = groqOriginal
    if (openaiOriginal === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = openaiOriginal
  })
  delete process.env.GROQ_API_KEY
  process.env.OPENAI_API_KEY = "teste-openai"
  global.fetch = async () => respostaJson(200, { text: "Obrigado." })
  const res = mockRes()
  await transcreverVoz({ file: { buffer: Buffer.from("audio"), mimetype: "audio/webm" }, body: {} }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.corpo.provedor, "openai")
  assert.equal(res.corpo.texto, "Obrigado.")
})

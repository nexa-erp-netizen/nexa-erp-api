const crypto = require("crypto")
const fs = require("fs/promises")
const https = require("https")
const os = require("os")
const path = require("path")
const { EdgeTTS } = require("node-edge-tts")

const VOZ_PADRAO = "pt-BR-FranciscaNeural"
const MODELO_WHISPER_PADRAO = "whisper-large-v3-turbo"
const LIMITE_TEXTO = 900
const LIMITE_PROMPT_WHISPER = 700
const TEMPO_LIMITE_WHISPER_MS = 30000

function configuracaoAzure() {
  return {
    chave: String(process.env.AZURE_SPEECH_KEY || "").trim(),
    regiao: String(process.env.AZURE_SPEECH_REGION || "").trim(),
    voz: String(process.env.AZURE_SPEECH_VOICE || VOZ_PADRAO).trim(),
  }
}

function configuracaoGroqWhisper() {
  return {
    chave: String(process.env.GROQ_API_KEY || "").trim(),
    modelo: String(process.env.GROQ_WHISPER_MODEL || MODELO_WHISPER_PADRAO).trim(),
  }
}

function escaparXml(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function limparTexto(valor) {
  return String(valor || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\{\s*\"(?:resposta|acao)\"[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITE_TEXTO)
}

function limparPromptWhisper(valor) {
  return String(valor || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITE_PROMPT_WHISPER)
}

function extensaoPorMime(mime = "") {
  const tipo = String(mime).toLowerCase()
  if (tipo.includes("wav")) return "wav"
  if (tipo.includes("ogg")) return "ogg"
  if (tipo.includes("mpeg") || tipo.includes("mp3")) return "mp3"
  if (tipo.includes("mp4") || tipo.includes("m4a")) return "m4a"
  return "webm"
}

async function solicitarAudioEdge({ texto, voz = VOZ_PADRAO }) {
  const arquivo = path.join(os.tmpdir(), `nexa-edge-tts-${crypto.randomUUID()}.mp3`)
  const tts = new EdgeTTS({
    voice: voz,
    lang: "pt-BR",
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
    rate: "-2%",
    pitch: "+0%",
    volume: "+0%",
    timeout: 20000,
  })

  try {
    await tts.ttsPromise(texto, arquivo)
    const audio = await fs.readFile(arquivo)
    if (!audio.length) throw new Error("O Microsoft Edge não retornou áudio.")
    return audio
  } finally {
    await fs.unlink(arquivo).catch(() => {})
  }
}

function solicitarAudioAzure({ chave, regiao, ssml }) {
  const opcoes = {
    hostname: `${regiao}.tts.speech.microsoft.com`,
    port: 443,
    path: "/cognitiveservices/v1",
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": chave,
      "Content-Type": "application/ssml+xml; charset=utf-8",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "Nexa-ERP-Voice",
      "Content-Length": Buffer.byteLength(ssml),
    },
    timeout: 20000,
  }

  return new Promise((resolve, reject) => {
    const requisicao = https.request(opcoes, (resposta) => {
      const partes = []
      resposta.on("data", (parte) => partes.push(parte))
      resposta.on("end", () => {
        const corpo = Buffer.concat(partes)
        if (resposta.statusCode >= 200 && resposta.statusCode < 300) {
          resolve(corpo)
          return
        }

        const detalhe = corpo.toString("utf8").slice(0, 500)
        const erro = new Error(`Azure Speech respondeu com status ${resposta.statusCode}${detalhe ? `: ${detalhe}` : ""}`)
        erro.statusCode = resposta.statusCode
        reject(erro)
      })
    })

    requisicao.on("timeout", () => requisicao.destroy(new Error("A voz neural demorou para responder.")))
    requisicao.on("error", reject)
    requisicao.write(ssml)
    requisicao.end()
  })
}

async function transcreverComGroq({ arquivo, prompt }) {
  const { chave, modelo } = configuracaoGroqWhisper()
  if (!chave) {
    const erro = new Error("A chave da Groq não está configurada.")
    erro.statusCode = 503
    throw erro
  }

  const mime = String(arquivo.mimetype || "audio/webm").split(";")[0]
  const extensao = extensaoPorMime(mime)
  const formulario = new FormData()
  formulario.append("file", new Blob([arquivo.buffer], { type: mime }), `nexa-voz.${extensao}`)
  formulario.append("model", modelo)
  formulario.append("language", "pt")
  formulario.append("response_format", "json")
  formulario.append("temperature", "0")
  if (prompt) formulario.append("prompt", limparPromptWhisper(prompt))

  const controlador = new AbortController()
  const timeout = setTimeout(() => controlador.abort(), TEMPO_LIMITE_WHISPER_MS)

  try {
    const resposta = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}` },
      body: formulario,
      signal: controlador.signal,
    })

    const dados = await resposta.json().catch(() => ({}))
    if (!resposta.ok) {
      const detalhe = dados?.error?.message || dados?.message || `status ${resposta.status}`
      const erro = new Error(`Groq Whisper: ${detalhe}`)
      erro.statusCode = resposta.status
      throw erro
    }

    return {
      texto: String(dados?.text || "").trim(),
      modelo,
      requisicaoId: dados?.x_groq?.id || null,
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      const erro = new Error("A transcrição demorou para responder.")
      erro.statusCode = 504
      throw erro
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function statusVoz(req, res) {
  const { chave, regiao, voz } = configuracaoAzure()
  const whisper = configuracaoGroqWhisper()
  return res.json({
    neuralDisponivel: true,
    provedor: "microsoft-edge",
    vozNeural: VOZ_PADRAO,
    fallback: chave && regiao ? `Azure Speech — ${voz}` : "Microsoft Maria (pt-BR)",
    azureConfigurado: Boolean(chave && regiao),
    transcricaoDisponivel: Boolean(whisper.chave),
    transcricaoProvedor: "groq-whisper",
    transcricaoModelo: whisper.modelo,
  })
}

async function transcreverVoz(req, res) {
  const arquivo = req.file
  if (!arquivo?.buffer?.length) {
    return res.status(400).json({ message: "Áudio não informado." })
  }

  try {
    const resultado = await transcreverComGroq({
      arquivo,
      prompt: req.body?.prompt,
    })

    return res.json({
      texto: resultado.texto,
      provedor: "groq-whisper",
      modelo: resultado.modelo,
      requisicaoId: resultado.requisicaoId,
    })
  } catch (error) {
    console.error("ERRO NA TRANSCRIÇÃO DA NEXA:", error?.message || error)
    const status = Number(error?.statusCode || 502)
    return res.status(status).json({
      message: status === 429
        ? "O limite temporário da transcrição foi atingido. Tente novamente em instantes."
        : error?.message || "Não foi possível transcrever a fala.",
    })
  }
}

async function sintetizarVoz(req, res) {
  const texto = limparTexto(req.body?.texto)
  if (!texto) return res.status(400).json({ message: "Texto não informado." })

  const { chave, regiao, voz } = configuracaoAzure()

  try {
    const audio = await solicitarAudioEdge({ texto, voz: VOZ_PADRAO })
    res.setHeader("Content-Type", "audio/mpeg")
    res.setHeader("Content-Length", audio.length)
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("X-Nexa-Voice", VOZ_PADRAO)
    res.setHeader("X-Nexa-Voice-Provider", "microsoft-edge")
    return res.send(audio)
  } catch (edgeError) {
    console.error("ERRO NA VOZ EDGE DA NEXA:", edgeError?.message || edgeError)

    if (chave && regiao) {
      try {
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR"><voice name="${escaparXml(voz)}"><prosody rate="-4%" pitch="+0%">${escaparXml(texto)}</prosody></voice></speak>`
        const audio = await solicitarAudioAzure({ chave, regiao, ssml })

        res.setHeader("Content-Type", "audio/mpeg")
        res.setHeader("Content-Length", audio.length)
        res.setHeader("Cache-Control", "private, no-store")
        res.setHeader("X-Nexa-Voice", voz)
        res.setHeader("X-Nexa-Voice-Provider", "azure-speech")
        return res.send(audio)
      } catch (azureError) {
        console.error("ERRO NA VOZ AZURE DA NEXA:", azureError?.message || azureError)
      }
    }

    return res.status(502).json({
      message: "A voz neural ficou indisponível. A Nexa usará a voz feminina do Windows.",
      fallbackLocal: true,
    })
  }
}

module.exports = { statusVoz, transcreverVoz, sintetizarVoz }

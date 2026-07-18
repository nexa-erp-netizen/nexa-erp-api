const crypto = require("crypto")
const fs = require("fs/promises")
const https = require("https")
const os = require("os")
const path = require("path")
const { EdgeTTS } = require("node-edge-tts")

const VOZ_PADRAO = "pt-BR-FranciscaNeural"
const LIMITE_TEXTO = 900

function configuracaoAzure() {
  return {
    chave: String(process.env.AZURE_SPEECH_KEY || "").trim(),
    regiao: String(process.env.AZURE_SPEECH_REGION || "").trim(),
    voz: String(process.env.AZURE_SPEECH_VOICE || VOZ_PADRAO).trim(),
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

async function statusVoz(req, res) {
  const { chave, regiao, voz } = configuracaoAzure()
  return res.json({
    neuralDisponivel: true,
    provedor: "microsoft-edge",
    vozNeural: VOZ_PADRAO,
    fallback: chave && regiao ? `Azure Speech — ${voz}` : "Microsoft Maria (pt-BR)",
    azureConfigurado: Boolean(chave && regiao),
  })
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

module.exports = { statusVoz, sintetizarVoz }

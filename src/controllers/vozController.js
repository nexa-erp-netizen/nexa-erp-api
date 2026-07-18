const https = require("https")

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

function solicitarAudio({ chave, regiao, ssml }) {
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
    neuralDisponivel: Boolean(chave && regiao),
    provedor: chave && regiao ? "azure-speech" : "windows",
    vozNeural: voz,
    fallback: "Microsoft Maria (pt-BR)",
  })
}

async function sintetizarVoz(req, res) {
  try {
    const { chave, regiao, voz } = configuracaoAzure()
    if (!chave || !regiao) {
      return res.status(503).json({
        message: "A voz neural ainda não está configurada. A Nexa usará a Microsoft Maria do Windows.",
        fallbackLocal: true,
      })
    }

    const texto = limparTexto(req.body?.texto)
    if (!texto) return res.status(400).json({ message: "Texto não informado." })

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR"><voice name="${escaparXml(voz)}"><prosody rate="-4%" pitch="+0%">${escaparXml(texto)}</prosody></voice></speak>`
    const audio = await solicitarAudio({ chave, regiao, ssml })

    res.setHeader("Content-Type", "audio/mpeg")
    res.setHeader("Content-Length", audio.length)
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("X-Nexa-Voice", voz)
    return res.send(audio)
  } catch (error) {
    console.error("ERRO NA VOZ NEURAL DA NEXA:", error.message)
    return res.status(error.statusCode || 502).json({
      message: "A voz neural ficou indisponível. A Nexa usará a voz feminina do Windows.",
      fallbackLocal: true,
    })
  }
}

module.exports = { statusVoz, sintetizarVoz }

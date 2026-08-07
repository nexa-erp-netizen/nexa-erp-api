const https = require("https")
const fs = require("fs")
const tls = require("tls")
const { X509Certificate } = require("crypto")
const { carregarCertificado } = require("./certificadoStorageService")
const { descriptografar } = require("./cofreCredenciaisService")

const ENDPOINT_HOMOLOGACAO_PR = "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeStatusServico4"
const ICP_BRASIL_RAIZ_SSL_URL = "https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv10.crt"
let raizIcpBrasilSslCache = null

function certificadoParaPem(conteudo) {
  const buffer = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo)
  if (buffer.toString("utf8", 0, 40).includes("BEGIN CERTIFICATE")) return buffer.toString("utf8")
  return new X509Certificate(buffer).toString()
}

function baixarRaizIcpBrasilSsl() {
  if (raizIcpBrasilSslCache) return Promise.resolve(raizIcpBrasilSslCache)
  return new Promise((resolve, reject) => {
    const requisicao = https.get(ICP_BRASIL_RAIZ_SSL_URL, { timeout: 15000, minVersion: "TLSv1.2" }, (resposta) => {
      if (resposta.statusCode !== 200) {
        resposta.resume()
        return reject(new Error(`O repositório oficial do ITI respondeu HTTP ${resposta.statusCode}.`))
      }
      const partes = []
      resposta.on("data", (parte) => partes.push(parte))
      resposta.on("end", () => {
        try {
          raizIcpBrasilSslCache = certificadoParaPem(Buffer.concat(partes))
          resolve(raizIcpBrasilSslCache)
        } catch (error) {
          reject(new Error(`O certificado raiz SSL do ITI é inválido: ${error.message}`))
        }
      })
    })
    requisicao.on("timeout", () => requisicao.destroy(new Error("Tempo esgotado ao carregar a cadeia oficial da ICP-Brasil.")))
    requisicao.on("error", reject)
  })
}

async function certificadosConfiaveis() {
  const certificados = [...tls.rootCertificates]
  const caminhosSistema = ["/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt"]
  for (const caminho of caminhosSistema) {
    try {
      if (fs.existsSync(caminho)) certificados.push(fs.readFileSync(caminho, "utf8"))
    } catch (error) {
      console.warn(`Não foi possível carregar a cadeia TLS do sistema em ${caminho}:`, error.message)
    }
  }
  if (process.env.SEFAZ_CA_BUNDLE) {
    const valor = process.env.SEFAZ_CA_BUNDLE.trim()
    try {
      certificados.push(valor.includes("BEGIN CERTIFICATE") ? valor : fs.readFileSync(valor, "utf8"))
    } catch (error) {
      throw new Error(`A cadeia adicional da SEFAZ não pôde ser carregada: ${error.message}`)
    }
  }
  try {
    certificados.push(await baixarRaizIcpBrasilSsl())
  } catch (error) {
    if (!process.env.SEFAZ_CA_BUNDLE) {
      throw new Error(`Não foi possível carregar a cadeia oficial da ICP-Brasil: ${error.message}`)
    }
    console.warn("Não foi possível atualizar a raiz SSL da ICP-Brasil; usando SEFAZ_CA_BUNDLE:", error.message)
  }
  return certificados
}

function extrair(xml, tag) {
  const encontrado = String(xml || "").match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))
  return encontrado ? encontrado[1].trim() : null
}

async function materializarA1(credencial) {
  if (!credencial?.arquivoCriptografado || !credencial?.segredoCriptografado) throw new Error("Certificado A1 e senha não estão completos no cofre.")
  return {
    pfx: await carregarCertificado(credencial.arquivoCriptografado),
    senha: descriptografar(credencial.segredoCriptografado).toString("utf8"),
  }
}

async function consultarStatusServicoPR(credencial) {
  const { pfx, senha } = await materializarA1(credencial)
  const ca = await certificadosConfiaveis()
  const corpo = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4"><consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><cUF>41</cUF><xServ>STATUS</xServ></consStatServ></nfeDadosMsg></soap12:Body></soap12:Envelope>`
  const url = new URL(ENDPOINT_HOMOLOGACAO_PR)
  return new Promise((resolve, reject) => {
    const requisicao = https.request({ hostname: url.hostname, port: 443, path: url.pathname, method: "POST", pfx, passphrase: senha, minVersion: "TLSv1.2", timeout: 20000,
      ca, rejectUnauthorized: true,
      headers: { "Content-Type": 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF"', "Content-Length": Buffer.byteLength(corpo) } }, (resposta) => {
      const partes = []
      resposta.on("data", (parte) => partes.push(parte))
      resposta.on("end", () => {
        const xml = Buffer.concat(partes).toString("utf8")
        const cStat = extrair(xml, "cStat"); const xMotivo = extrair(xml, "xMotivo")
        if (resposta.statusCode < 200 || resposta.statusCode >= 300) return reject(new Error(xMotivo || `SEFA/PR respondeu HTTP ${resposta.statusCode}.`))
        if (!cStat) return reject(new Error("A SEFA/PR respondeu sem o status esperado."))
        resolve({ cStat, xMotivo, ambiente: "homologacao", uf: "PR", online: cStat === "107" })
      })
    })
    requisicao.on("timeout", () => requisicao.destroy(new Error("Tempo esgotado ao consultar a SEFA/PR.")))
    requisicao.on("error", reject); requisicao.end(corpo)
  })
}

module.exports = { consultarStatusServicoPR, materializarA1, ENDPOINT_HOMOLOGACAO_PR }

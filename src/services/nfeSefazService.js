const https = require("https")
const fs = require("fs")
const path = require("path")
const tls = require("tls")
const { carregarCertificado } = require("./certificadoStorageService")
const { descriptografar } = require("./cofreCredenciaisService")

const ENDPOINT_HOMOLOGACAO_PR = "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeStatusServico4"
const CA_SEFAZ_PR_LOCAL = path.join(__dirname, "certificates", "sefaz-pr-homologacao-chain.pem")

function certificadosConfiaveis() {
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
    certificados.push(fs.readFileSync(CA_SEFAZ_PR_LOCAL, "utf8"))
  } catch (error) {
    throw new Error(`A cadeia local da SEFA/PR não pôde ser carregada: ${error.message}`)
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
  const ca = certificadosConfiaveis()
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
        resolve({ cStat, xMotivo, ambiente: "homologacao", uf: "PR", online: cStat === "107", certificadoA1: "ok", cadeiaTls: "ok" })
      })
    })
    requisicao.on("timeout", () => requisicao.destroy(new Error("Tempo esgotado ao consultar a SEFA/PR.")))
    requisicao.on("error", (error) => {
      const falhasTls = new Set(["SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED"])
      if (falhasTls.has(error.code)) return reject(new Error(`Falha na cadeia TLS da SEFA/PR (${error.code}): ${error.message}`))
      reject(error)
    }); requisicao.end(corpo)
  })
}

module.exports = { consultarStatusServicoPR, materializarA1, ENDPOINT_HOMOLOGACAO_PR }

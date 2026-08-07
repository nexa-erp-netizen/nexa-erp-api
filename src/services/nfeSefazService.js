const https = require("https")
const { carregarCertificado } = require("./certificadoStorageService")
const { descriptografar } = require("./cofreCredenciaisService")

const ENDPOINT_HOMOLOGACAO_PR = "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeStatusServico4"

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
  const corpo = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4"><consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><tpAmb>2</tpAmb><cUF>41</cUF><xServ>STATUS</xServ></consStatServ></nfeDadosMsg></soap12:Body></soap12:Envelope>`
  const url = new URL(ENDPOINT_HOMOLOGACAO_PR)
  return new Promise((resolve, reject) => {
    const requisicao = https.request({ hostname: url.hostname, port: 443, path: url.pathname, method: "POST", pfx, passphrase: senha, minVersion: "TLSv1.2", timeout: 20000,
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

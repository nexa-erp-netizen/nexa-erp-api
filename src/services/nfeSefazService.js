const https = require("https")
const fs = require("fs")
const path = require("path")
const tls = require("tls")
const crypto = require("crypto")
const forge = require("node-forge")
const PDFDocument = require("pdfkit")
const { SignedXml } = require("xml-crypto")
const { DOMParser } = require("@xmldom/xmldom")
const { carregarCertificado } = require("./certificadoStorageService")
const { descriptografar } = require("./cofreCredenciaisService")

const BASE_HOMOLOGACAO_PR = "https://homologacao.nfe.sefa.pr.gov.br/nfe"
const ENDPOINT_HOMOLOGACAO_PR = `${BASE_HOMOLOGACAO_PR}/NFeStatusServico4`
const ENDPOINT_AUTORIZACAO_PR = `${BASE_HOMOLOGACAO_PR}/NFeAutorizacao4`
const CA_SEFAZ_PR_LOCAL = path.join(__dirname, "certificates", "sefaz-pr-homologacao-chain.pem")
const NS_NFE = "http://www.portalfiscal.inf.br/nfe"
const NOME_HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"

const somenteDigitos = (valor) => String(valor || "").replace(/\D/g, "")
const decimal = (valor) => Number(valor || 0).toFixed(2)
const xmlEscape = (valor) => String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")

function certificadosConfiaveis() {
  const certificados = [...tls.rootCertificates]
  for (const caminho of ["/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt"]) {
    try { if (fs.existsSync(caminho)) certificados.push(fs.readFileSync(caminho, "utf8")) } catch (error) { console.warn("Falha ao carregar CA do sistema:", error.message) }
  }
  if (process.env.SEFAZ_CA_BUNDLE) {
    const valor = process.env.SEFAZ_CA_BUNDLE.trim()
    certificados.push(valor.includes("BEGIN CERTIFICATE") ? valor : fs.readFileSync(valor, "utf8"))
  }
  certificados.push(fs.readFileSync(CA_SEFAZ_PR_LOCAL, "utf8"))
  return certificados
}

function extrair(xml, tag) {
  const encontrado = String(xml || "").match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"))
  return encontrado ? encontrado[1].trim() : null
}

async function materializarA1(credencial) {
  if (!credencial?.arquivoCriptografado || !credencial?.segredoCriptografado) throw new Error("Certificado A1 e senha não estão completos no cofre.")
  return { pfx: await carregarCertificado(credencial.arquivoCriptografado), senha: descriptografar(credencial.segredoCriptografado).toString("utf8") }
}

function lerChavesA1(pfx, senha) {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary")))
  const pkcs12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha)
  const chaves = pkcs12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []
  const certificados = pkcs12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  if (!chaves[0]?.key || !certificados[0]?.cert) throw new Error("O A1 não contém chave privada e certificado utilizáveis.")
  return { chavePem: forge.pki.privateKeyToPem(chaves[0].key), certificadoPem: forge.pki.certificateToPem(certificados[0].cert) }
}

function postSoap(endpoint, acao, corpo, a1) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>${corpo}</soap12:Body></soap12:Envelope>`
  const url = new URL(endpoint)
  return new Promise((resolve, reject) => {
    const requisicao = https.request({ hostname: url.hostname, port: 443, path: url.pathname, method: "POST", pfx: a1.pfx, passphrase: a1.senha, minVersion: "TLSv1.2", timeout: 30000, ca: certificadosConfiaveis(), rejectUnauthorized: true,
      headers: { "Content-Type": `application/soap+xml; charset=utf-8; action="${acao}"`, "Content-Length": Buffer.byteLength(envelope) } }, (resposta) => {
      const partes = []
      resposta.on("data", (parte) => partes.push(parte))
      resposta.on("end", () => {
        const xml = Buffer.concat(partes).toString("utf8")
        if (resposta.statusCode < 200 || resposta.statusCode >= 300) return reject(new Error(extrair(xml, "Text") || `SEFA/PR respondeu HTTP ${resposta.statusCode}.`))
        resolve(xml)
      })
    })
    requisicao.on("timeout", () => requisicao.destroy(new Error("Tempo esgotado ao consultar a SEFA/PR.")))
    requisicao.on("error", reject)
    requisicao.end(envelope)
  })
}

async function consultarStatusServicoPR(credencial) {
  const a1 = await materializarA1(credencial)
  const mensagem = `<nfeDadosMsg xmlns="${NS_NFE}/wsdl/NFeStatusServico4"><consStatServ xmlns="${NS_NFE}" versao="4.00"><tpAmb>2</tpAmb><cUF>41</cUF><xServ>STATUS</xServ></consStatServ></nfeDadosMsg>`
  const xml = await postSoap(ENDPOINT_HOMOLOGACAO_PR, `${NS_NFE}/wsdl/NFeStatusServico4/nfeStatusServicoNF`, mensagem, a1)
  const cStat = extrair(xml, "cStat"); const xMotivo = extrair(xml, "xMotivo")
  if (!cStat) throw new Error("A SEFA/PR respondeu sem o status esperado.")
  return { cStat, xMotivo, ambiente: "homologacao", uf: "PR", online: cStat === "107", certificadoA1: "ok", cadeiaTls: "ok" }
}

function modulo11(chave43) {
  let peso = 2; let soma = 0
  for (let i = chave43.length - 1; i >= 0; i -= 1) { soma += Number(chave43[i]) * peso; peso = peso === 9 ? 2 : peso + 1 }
  const resto = soma % 11; return resto === 0 || resto === 1 ? 0 : 11 - resto
}

function codigoUf(uf) {
  const codigos = { AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53", ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15", PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17" }
  return codigos[String(uf || "").toUpperCase()]
}

function montarNFe({ nota, emitente, configuracao }) {
  const agora = new Date(); const offset = -agora.getTimezoneOffset(); const sinal = offset >= 0 ? "+" : "-"; const abs = Math.abs(offset)
  const dhEmi = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,"0")}-${String(agora.getDate()).padStart(2,"0")}T${String(agora.getHours()).padStart(2,"0")}:${String(agora.getMinutes()).padStart(2,"0")}:${String(agora.getSeconds()).padStart(2,"0")}${sinal}${String(Math.floor(abs/60)).padStart(2,"0")}:${String(abs%60).padStart(2,"0")}`
  const cnpj = somenteDigitos(emitente.cnpj); const numero = Number(nota.numero); const serie = Number(nota.serie)
  const cNF = crypto.randomInt(0, 100000000).toString().padStart(8, "0"); const aamm = `${String(agora.getFullYear()).slice(-2)}${String(agora.getMonth()+1).padStart(2,"0")}`
  const chave43 = `41${aamm}${cnpj}55${String(serie).padStart(3,"0")}${String(numero).padStart(9,"0")}1${cNF}`; const chave = `${chave43}${modulo11(chave43)}`
  const destDoc = somenteDigitos(nota.destinatario.cpfCnpj); const tagDoc = destDoc.length === 14 ? "CNPJ" : "CPF"
  const ufDest = String(nota.destinatario.estado || "PR").toUpperCase(); const idDest = ufDest === "PR" ? "1" : "2"; const cMunDest = somenteDigitos(nota.destinatario.codigoMunicipio || configuracao.codigoMunicipio)
  const itens = nota.itens.map((item, indice) => `<det nItem="${indice+1}"><prod><cProd>${xmlEscape(item.codigo)}</cProd><cEAN>SEM GTIN</cEAN><xProd>${xmlEscape(item.descricao)}</xProd><NCM>${somenteDigitos(item.ncm)}</NCM>${item.cest ? `<CEST>${somenteDigitos(item.cest)}</CEST>` : ""}<CFOP>${somenteDigitos(item.cfop)}</CFOP><uCom>${xmlEscape(item.unidade || "UN")}</uCom><qCom>${Number(item.quantidade).toFixed(4)}</qCom><vUnCom>${Number(item.valorUnitario).toFixed(10)}</vUnCom><vProd>${decimal(item.valorTotal)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${xmlEscape(item.unidade || "UN")}</uTrib><qTrib>${Number(item.quantidade).toFixed(4)}</qTrib><vUnTrib>${Number(item.valorUnitario).toFixed(10)}</vUnTrib><indTot>1</indTot></prod><imposto><ICMS><ICMSSN102><orig>${item.origem || "0"}</orig><CSOSN>${item.csosn || "102"}</CSOSN></ICMSSN102></ICMS><PIS><PISOutr><CST>99</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>99</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>`).join("")
  const vProd = decimal(nota.valorProdutos); const vFrete = decimal(nota.valorFrete); const vDesc = decimal(nota.valorDesconto); const vNF = decimal(nota.valorTotal)
  const xml = `<NFe xmlns="${NS_NFE}"><infNFe Id="NFe${chave}" versao="4.00"><ide><cUF>41</cUF><cNF>${cNF}</cNF><natOp>${xmlEscape(nota.naturezaOperacao)}</natOp><mod>55</mod><serie>${serie}</serie><nNF>${numero}</nNF><dhEmi>${dhEmi}</dhEmi><tpNF>1</tpNF><idDest>${idDest}</idDest><cMunFG>${somenteDigitos(configuracao.codigoMunicipio)}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(-1)}</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>Nexa ERP 3.11.0</verProc></ide><emit><CNPJ>${cnpj}</CNPJ><xNome>${xmlEscape(emitente.nome)}</xNome><enderEmit><xLgr>${xmlEscape(emitente.endereco)}</xLgr><nro>${xmlEscape(emitente.numero)}</nro>${emitente.complemento ? `<xCpl>${xmlEscape(emitente.complemento)}</xCpl>` : ""}<xBairro>${xmlEscape(emitente.bairro)}</xBairro><cMun>${somenteDigitos(configuracao.codigoMunicipio)}</cMun><xMun>${xmlEscape(emitente.cidade)}</xMun><UF>PR</UF><CEP>${somenteDigitos(emitente.cep)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderEmit><IE>${somenteDigitos(emitente.inscricaoEstadual)}</IE><CRT>${configuracao.crt}</CRT></emit><dest><${tagDoc}>${destDoc}</${tagDoc}><xNome>${NOME_HOMOLOGACAO}</xNome><enderDest><xLgr>${xmlEscape(nota.destinatario.endereco)}</xLgr><nro>${xmlEscape(nota.destinatario.numero)}</nro><xBairro>${xmlEscape(nota.destinatario.bairro)}</xBairro><cMun>${cMunDest}</cMun><xMun>${xmlEscape(nota.destinatario.cidade)}</xMun><UF>${ufDest}</UF><CEP>${somenteDigitos(nota.destinatario.cep)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderDest><indIEDest>${nota.destinatario.inscricaoEstadual ? "1" : "9"}</indIEDest>${nota.destinatario.inscricaoEstadual ? `<IE>${somenteDigitos(nota.destinatario.inscricaoEstadual)}</IE>` : ""}${nota.destinatario.email ? `<email>${xmlEscape(nota.destinatario.email)}</email>` : ""}</dest>${itens}<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${vProd}</vProd><vFrete>${vFrete}</vFrete><vSeg>0.00</vSeg><vDesc>${vDesc}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${vNF}</vNF></ICMSTot></total><transp><modFrete>9</modFrete></transp><pag><detPag><indPag>0</indPag><tPag>01</tPag><vPag>${vNF}</vPag></detPag></pag></infNFe></NFe>`
  return { xml, chave }
}

function assinarNFe(xml, chavePem, certificadoPem) {
  const assinatura = new SignedXml({ privateKey: chavePem, publicCert: certificadoPem, getKeyInfoContent: () => `<X509Data><X509Certificate>${certificadoPem.replace(/-----[^-]+-----|\s/g, "")}</X509Certificate></X509Data>` })
  assinatura.addReference({ xpath: "//*[local-name(.)='infNFe']", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"], digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1" })
  assinatura.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
  assinatura.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
  assinatura.computeSignature(xml, { location: { reference: "//*[local-name(.)='infNFe']", action: "after" } })
  const assinado = assinatura.getSignedXml(); new DOMParser().parseFromString(assinado, "text/xml")
  return assinado
}

async function autorizarNFePR({ credencial, nota, emitente, configuracao }) {
  if (configuracao.ambiente !== "homologacao") throw new Error("Produção permanece bloqueada nesta versão.")
  const a1 = await materializarA1(credencial); const chaves = lerChavesA1(a1.pfx, a1.senha)
  const montada = montarNFe({ nota, emitente, configuracao }); const xmlAssinado = assinarNFe(montada.xml, chaves.chavePem, chaves.certificadoPem)
  const lote = `${Date.now()}`.slice(-15).padStart(15, "0")
  const enviNFe = `<enviNFe xmlns="${NS_NFE}" versao="4.00"><idLote>${lote}</idLote><indSinc>1</indSinc>${xmlAssinado}</enviNFe>`
  const mensagem = `<nfeDadosMsg xmlns="${NS_NFE}/wsdl/NFeAutorizacao4">${enviNFe}</nfeDadosMsg>`
  const resposta = await postSoap(ENDPOINT_AUTORIZACAO_PR, `${NS_NFE}/wsdl/NFeAutorizacao4/nfeAutorizacaoLote`, mensagem, a1)
  const protocolo = extrair(resposta, "protNFe"); const cStatLote = extrair(resposta, "cStat"); const motivos = [...resposta.matchAll(/<(?:\w+:)?xMotivo>([\s\S]*?)<\/(?:\w+:)?xMotivo>/gi)].map((m) => m[1].trim())
  const cStats = [...resposta.matchAll(/<(?:\w+:)?cStat>([\s\S]*?)<\/(?:\w+:)?cStat>/gi)].map((m) => m[1].trim()); const cStat = cStats.at(-1) || cStatLote
  const xMotivo = motivos.at(-1) || "Retorno sem motivo"; const nProt = extrair(resposta, "nProt")
  if (cStat !== "100" || !protocolo) return { autorizado: false, cStat, xMotivo, chave: montada.chave, xmlEnvio: enviNFe, resposta }
  const xmlAutorizado = `<nfeProc xmlns="${NS_NFE}" versao="4.00">${xmlAssinado}<protNFe versao="4.00">${protocolo}</protNFe></nfeProc>`
  return { autorizado: true, cStat, xMotivo, chave: montada.chave, protocolo: nProt, xmlEnvio: enviNFe, xmlAutorizado }
}

function gerarDanfePdf(nota) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 32 }); const partes = []
    doc.on("data", (p) => partes.push(p)); doc.on("end", () => resolve(Buffer.concat(partes))); doc.on("error", reject)
    doc.fontSize(15).text("DANFE — Documento Auxiliar da NF-e", { align: "center" }).moveDown(0.3)
    doc.fontSize(9).text("SEM VALOR FISCAL — AMBIENTE DE HOMOLOGAÇÃO", { align: "center" }).moveDown()
    doc.fontSize(10).text(`NF-e nº ${nota.numero}  Série ${nota.serie}`).text(`Chave de acesso: ${nota.chaveAcesso || ""}`).text(`Protocolo: ${nota.protocolo || ""}`).moveDown()
    doc.text(`Destinatário do rascunho: ${nota.destinatario?.nome || ""}`).text(`CPF/CNPJ: ${nota.destinatario?.cpfCnpj || ""}`).moveDown()
    doc.font("Helvetica-Bold").text("Itens").font("Helvetica")
    nota.itens.forEach((item, i) => doc.text(`${i+1}. ${item.codigo} — ${item.descricao} | ${Number(item.quantidade).toFixed(2)} ${item.unidade} × R$ ${decimal(item.valorUnitario)} = R$ ${decimal(item.valorTotal)}`))
    doc.moveDown().font("Helvetica-Bold").text(`Total da NF-e: R$ ${decimal(nota.valorTotal)}`, { align: "right" }).font("Helvetica")
    doc.moveDown(2).fontSize(8).text("Representação simplificada para conferência interna. O XML autorizado é o documento fiscal eletrônico.", { align: "center" })
    doc.end()
  })
}

module.exports = { consultarStatusServicoPR, autorizarNFePR, gerarDanfePdf, materializarA1, montarNFe, assinarNFe, ENDPOINT_HOMOLOGACAO_PR, ENDPOINT_AUTORIZACAO_PR }

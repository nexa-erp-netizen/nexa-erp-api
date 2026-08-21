const crypto = require("crypto")

function chave() {
  const segredo = String(
    process.env.NEXA_DOCUMENT_KEY
    || process.env.CREDENCIAIS_MASTER_KEY
    || process.env.JWT_SECRET
    || ""
  ).trim()
  if (segredo.length < 24) throw new Error("Chave de proteção documental não configurada")
  return crypto.createHash("sha256").update(`nexa-documentos:${segredo}`).digest()
}

function criptografarDocumento(texto) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", chave(), iv)
  const conteudo = Buffer.from(String(texto || ""), "utf8")
  const criptografado = Buffer.concat([cipher.update(conteudo), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), criptografado.toString("base64")].join(".")
}

function descriptografarDocumento(valor) {
  const [versao, iv, tag, conteudo] = String(valor || "").split(".")
  if (versao !== "v1" || !iv || !tag || !conteudo) throw new Error("Conteúdo documental protegido inválido")
  const decipher = crypto.createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(conteudo, "base64")), decipher.final()]).toString("utf8")
}

module.exports = { criptografarDocumento, descriptografarDocumento }

const crypto = require("crypto")

function obterChave() {
  const valor = String(process.env.CREDENCIAIS_MASTER_KEY || "").trim()
  const chave = Buffer.from(valor, "base64")
  if (chave.length !== 32) {
    throw new Error("CREDENCIAIS_MASTER_KEY deve conter 32 bytes em base64")
  }
  return chave
}

function criptografar(valor) {
  if (valor === undefined || valor === null || valor === "") return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", obterChave(), iv)
  const conteudo = Buffer.isBuffer(valor) ? valor : Buffer.from(String(valor), "utf8")
  const criptografado = Buffer.concat([cipher.update(conteudo), cipher.final()])
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    criptografado.toString("base64"),
  ].join(".")
}

function descriptografar(valor) {
  if (!valor) return null
  const [versao, iv, tag, conteudo] = String(valor).split(".")
  if (versao !== "v1" || !iv || !tag || !conteudo) throw new Error("Segredo criptografado inválido")
  const decipher = crypto.createDecipheriv("aes-256-gcm", obterChave(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(conteudo, "base64")), decipher.final()])
}

function chaveConfigurada() {
  try {
    obterChave()
    return true
  } catch {
    return false
  }
}

module.exports = { criptografar, descriptografar, chaveConfigurada }

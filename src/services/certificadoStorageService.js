const crypto = require("crypto")
const supabase = require("../config/supabase")
const { criptografar, descriptografar } = require("./cofreCredenciaisService")

const BUCKET = process.env.NFSE_CERTIFICADOS_BUCKET || "nexa-certificados"
const PREFIXO = "supabase:v1:"

function caminhoDoCertificado(clienteId, nomeArquivo = "certificado.pfx") {
  const extensao = /\.p12$/i.test(nomeArquivo) ? ".p12" : ".pfx"
  return `${Number(clienteId)}/${crypto.randomUUID()}${extensao}.enc`
}

async function garantirBucketPrivado() {
  const { data, error } = await supabase.storage.getBucket(BUCKET)
  if (!error && data) return
  const criado = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 3 * 1024 * 1024,
    allowedMimeTypes: ["application/octet-stream", "application/x-pkcs12", "application/pkcs12"],
  })
  if (criado.error && !/already exists/i.test(criado.error.message || "")) throw criado.error
}

async function salvarCertificado({ clienteId, nomeArquivo, buffer }) {
  await garantirBucketPrivado()
  const caminho = caminhoDoCertificado(clienteId, nomeArquivo)
  const conteudoCriptografado = Buffer.from(criptografar(buffer), "utf8")
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, conteudoCriptografado, {
    contentType: "application/octet-stream",
    upsert: false,
  })
  if (error) throw error
  return `${PREFIXO}${caminho}`
}

async function carregarCertificado(referencia) {
  if (!String(referencia || "").startsWith(PREFIXO)) return descriptografar(referencia)
  const caminho = String(referencia).slice(PREFIXO.length)
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho)
  if (error) throw error
  return descriptografar(Buffer.from(await data.arrayBuffer()).toString("utf8"))
}

async function removerCertificado(referencia) {
  if (!String(referencia || "").startsWith(PREFIXO)) return
  const caminho = String(referencia).slice(PREFIXO.length)
  const { error } = await supabase.storage.from(BUCKET).remove([caminho])
  if (error) throw error
}

function armazenadoNoSupabase(referencia) {
  return String(referencia || "").startsWith(PREFIXO)
}

module.exports = { salvarCertificado, carregarCertificado, removerCertificado, armazenadoNoSupabase }

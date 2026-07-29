const crypto = require("crypto")
const jwt = require("jsonwebtoken")
const { google } = require("googleapis")
const GoogleDriveConexao = require("../models/GoogleDriveConexao")

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

function configurado() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_REDIRECT_URI &&
    process.env.DRIVE_TOKEN_ENCRYPTION_KEY
  )
}

function chaveCriptografia() {
  const valor = process.env.DRIVE_TOKEN_ENCRYPTION_KEY
  if (!valor) throw new Error("DRIVE_TOKEN_ENCRYPTION_KEY não configurada")
  return crypto.createHash("sha256").update(valor).digest()
}

function criptografar(valor) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", chaveCriptografia(), iv)
  const conteudo = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, conteudo].map((item) => item.toString("base64url")).join(".")
}

function descriptografar(valor) {
  const [iv, tag, conteudo] = String(valor || "").split(".").map((item) => Buffer.from(item, "base64url"))
  if (!iv || !tag || !conteudo) throw new Error("Token do Drive inválido")
  const decipher = crypto.createDecipheriv("aes-256-gcm", chaveCriptografia(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(conteudo), decipher.final()]).toString("utf8")
}

function oauthClient() {
  if (!configurado()) throw new Error("Integração Google Drive ainda não configurada no servidor")
  return new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  )
}

function criarEstado(usuarioId) {
  return jwt.sign(
    { tipo: "google-drive-oauth", usuarioId },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  )
}

function validarEstado(state) {
  const dados = jwt.verify(state, process.env.JWT_SECRET)
  if (dados.tipo !== "google-drive-oauth" || !dados.usuarioId) throw new Error("Estado OAuth inválido")
  return dados
}

function gerarUrlAutorizacao(usuarioId, email = "") {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [DRIVE_SCOPE],
    state: criarEstado(usuarioId),
    login_hint: email || undefined,
  })
}

async function salvarAutorizacao({ usuarioId, code }) {
  const client = oauthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error("O Google não devolveu autorização permanente. Tente conectar novamente.")
  }

  client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: "v2", auth: client })
  const { data: perfil } = await oauth2.userinfo.get()

  const [conexao] = await GoogleDriveConexao.upsert({
    usuarioId,
    emailGoogle: perfil.email || null,
    refreshTokenCriptografado: criptografar(tokens.refresh_token),
    conectadoEm: new Date(),
  }, { returning: true })

  return conexao
}

async function clienteAutorizado(usuarioId) {
  const conexao = await GoogleDriveConexao.findOne({ where: { usuarioId } })
  if (!conexao) throw new Error("Google Drive não conectado")
  const client = oauthClient()
  client.setCredentials({ refresh_token: descriptografar(conexao.refreshTokenCriptografado) })
  return { conexao, client, drive: google.drive({ version: "v3", auth: client }) }
}

async function listarPastas(usuarioId, parentId = null) {
  const { conexao, drive } = await clienteAutorizado(usuarioId)
  const pastaPai = parentId || conexao.pastaRaizId || "root"
  const pastas = []
  let pageToken

  do {
    const { data } = await drive.files.list({
      q: `'${String(pastaPai).replace(/'/g, "\\'")}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "nextPageToken,files(id,name,webViewLink,modifiedTime)",
      orderBy: "name_natural",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    pastas.push(...(data.files || []))
    pageToken = data.nextPageToken
  } while (pageToken)

  return pastas
}

async function listarArquivosDaPasta(usuarioId, pastaId, limite = 200) {
  const { drive } = await clienteAutorizado(usuarioId)
  const arquivos = []
  const fila = [pastaId]

  while (fila.length && arquivos.length < limite) {
    const atual = fila.shift()
    let pageToken
    do {
      const { data } = await drive.files.list({
        q: `'${String(atual).replace(/'/g, "\\'")}' in parents and trashed=false`,
        fields: "nextPageToken,files(id,name,mimeType,size,webViewLink,modifiedTime)",
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
      for (const item of data.files || []) {
        if (item.mimeType === "application/vnd.google-apps.folder") fila.push(item.id)
        else arquivos.push(item)
        if (arquivos.length >= limite) break
      }
      pageToken = data.nextPageToken
    } while (pageToken && arquivos.length < limite)
  }
  return arquivos
}

async function baixarArquivoDrive(usuarioId, arquivo) {
  const { drive } = await clienteAutorizado(usuarioId)
  if (arquivo.mimeType === "application/vnd.google-apps.document") {
    const { data } = await drive.files.export(
      { fileId: arquivo.id, mimeType: "text/plain" },
      { responseType: "arraybuffer" }
    )
    return { buffer: Buffer.from(data), nome: `${arquivo.name}.txt` }
  }
  if (arquivo.mimeType === "application/vnd.google-apps.spreadsheet") {
    const { data } = await drive.files.export(
      { fileId: arquivo.id, mimeType: "text/csv" },
      { responseType: "arraybuffer" }
    )
    return { buffer: Buffer.from(data), nome: `${arquivo.name}.csv` }
  }
  const { data } = await drive.files.get(
    { fileId: arquivo.id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  )
  return { buffer: Buffer.from(data), nome: arquivo.name }
}

async function revogar(usuarioId) {
  const conexao = await GoogleDriveConexao.findOne({ where: { usuarioId } })
  if (!conexao) return
  try {
    const client = oauthClient()
    const token = descriptografar(conexao.refreshTokenCriptografado)
    await client.revokeToken(token)
  } catch (error) {
    console.warn("Não foi possível revogar o token no Google:", error.message)
  }
  await conexao.destroy()
}

module.exports = {
  configurado,
  gerarUrlAutorizacao,
  validarEstado,
  salvarAutorizacao,
  clienteAutorizado,
  listarPastas,
  listarArquivosDaPasta,
  baixarArquivoDrive,
  revogar,
}

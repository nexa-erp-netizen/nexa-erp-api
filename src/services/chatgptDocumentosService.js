const path = require("path")
const jwt = require("jsonwebtoken")
const Cliente = require("../models/Cliente")
const GoogleDrivePastaCliente = require("../models/GoogleDrivePastaCliente")
const { listarArquivosDaPasta, baixarArquivoDrive } = require("./googleDriveService")

const LIMITE_RETORNO_GPT = 10 * 1024 * 1024
const LIMITE_LISTAGEM = 500
const MIME_IMAGEM = /^image\//i
const MIME_VIDEO = /^video\//i
const DURACAO_LINK_SEGUNDOS = 5 * 60

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function termosBusca(busca, cliente) {
  const ignorar = new Set([
    "arquivo", "arquivos", "documento", "documentos", "google", "drive",
    "cliente", "localize", "localizar", "procure", "procurar", "busque",
    "buscar", "encontre", "encontrar", "envie", "enviar", "baixe", "baixar",
    "mostre", "mostrar", "abra", "abrir", "para", "pasta", "dele", "dela",
    "de", "do", "da", "dos", "um", "uma", "o", "a",
  ])
  normalizar(cliente?.nome).split(" ").filter(Boolean).forEach((termo) => ignorar.add(termo))
  return [...new Set(normalizar(busca).split(" ").filter((termo) => termo.length >= 2 && !ignorar.has(termo)))]
}

function pontuarArquivo(arquivo, termos) {
  const nome = normalizar(path.parse(String(arquivo.name || "")).name)
  const tokens = new Set(nome.split(" ").filter(Boolean))
  const correspondencias = termos.filter((termo) => tokens.has(termo) || nome.includes(termo))
  const exatas = termos.filter((termo) => tokens.has(termo)).length
  return {
    pontos: (exatas * 10) + ((correspondencias.length - exatas) * 4),
    correspondencias: correspondencias.length,
  }
}

async function contextoCliente({ usuarioId, clienteId }) {
  const id = Number(clienteId)
  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error("clienteId inválido")
    erro.status = 400
    throw erro
  }
  const cliente = await Cliente.findByPk(id)
  if (!cliente) {
    const erro = new Error("Cliente não encontrado")
    erro.status = 404
    throw erro
  }
  const vinculo = await GoogleDrivePastaCliente.findOne({ where: { usuarioId, clienteId: id } })
  if (!vinculo) {
    const erro = new Error(`O cliente ${cliente.nome} ainda não possui uma pasta do Google Drive vinculada.`)
    erro.status = 404
    throw erro
  }
  return { cliente, vinculo }
}

async function arquivosAutorizados({ usuarioId, clienteId }) {
  const { cliente, vinculo } = await contextoCliente({ usuarioId, clienteId })
  const arquivos = await listarArquivosDaPasta(usuarioId, vinculo.pastaDriveId, LIMITE_LISTAGEM)
  return { cliente, vinculo, arquivos }
}

async function buscarDocumentosChatGPT({ usuarioId, clienteId, busca }) {
  const { cliente, vinculo, arquivos } = await arquivosAutorizados({ usuarioId, clienteId })
  const termos = termosBusca(busca, cliente)
  const candidatos = arquivos
    .map((arquivo) => ({ arquivo, ...pontuarArquivo(arquivo, termos) }))
    .filter((item) => !termos.length || item.correspondencias > 0)
    .sort((a, b) => b.pontos - a.pontos || String(b.arquivo.modifiedTime || "").localeCompare(String(a.arquivo.modifiedTime || "")))
    .slice(0, 10)

  return {
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    pasta: vinculo.pastaDriveNome,
    total: candidatos.length,
    arquivos: candidatos.map(({ arquivo }) => ({
      arquivoId: arquivo.id,
      nome: arquivo.name,
      mimeType: arquivo.mimeType,
      tamanho: arquivo.size ? Number(arquivo.size) : null,
      modificadoEm: arquivo.modifiedTime || null,
      podeEnviarNoChat: !MIME_IMAGEM.test(String(arquivo.mimeType || ""))
        && !MIME_VIDEO.test(String(arquivo.mimeType || ""))
        && (!arquivo.size || Number(arquivo.size) <= LIMITE_RETORNO_GPT),
      podeVisualizarPorLink: MIME_IMAGEM.test(String(arquivo.mimeType || "")),
    })),
  }
}

async function baixarDocumentoChatGPT({ usuarioId, clienteId, arquivoId }) {
  const { cliente, arquivos } = await arquivosAutorizados({ usuarioId, clienteId })
  const arquivo = arquivos.find((item) => String(item.id) === String(arquivoId || ""))
  if (!arquivo) {
    const erro = new Error("Arquivo não encontrado na pasta vinculada a esse cliente")
    erro.status = 404
    throw erro
  }
  if (MIME_IMAGEM.test(String(arquivo.mimeType || ""))) {
    return {
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      imagem: true,
      arquivoId: arquivo.id,
      nome: arquivo.name,
      mimeType: arquivo.mimeType,
    }
  }
  if (MIME_VIDEO.test(String(arquivo.mimeType || ""))) {
    const erro = new Error("Vídeos não podem ser enviados por esta Action")
    erro.status = 415
    throw erro
  }
  if (arquivo.size && Number(arquivo.size) > LIMITE_RETORNO_GPT) {
    const erro = new Error("O arquivo ultrapassa o limite de 10 MB do ChatGPT")
    erro.status = 413
    throw erro
  }

  const baixado = await baixarArquivoDrive(usuarioId, arquivo)
  if (baixado.buffer.length > LIMITE_RETORNO_GPT) {
    const erro = new Error("O arquivo ultrapassa o limite de 10 MB do ChatGPT")
    erro.status = 413
    throw erro
  }
  return {
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    arquivo: {
      name: baixado.nome,
      mime_type: arquivo.mimeType === "application/vnd.google-apps.document" ? "text/plain"
        : arquivo.mimeType === "application/vnd.google-apps.spreadsheet" ? "text/csv"
          : (arquivo.mimeType || "application/octet-stream"),
      content: baixado.buffer.toString("base64"),
    },
  }
}

function segredoLinkTemporario() {
  const segredo = process.env.NEXA_DOCUMENT_LINK_SECRET || process.env.JWT_SECRET
  if (!segredo) throw new Error("Segredo para links temporários não configurado")
  return segredo
}

function gerarTokenVisualizacao({ usuarioId, clienteId, arquivoId }) {
  return jwt.sign(
    { tipo: "nexa-drive-imagem", usuarioId, clienteId, arquivoId },
    segredoLinkTemporario(),
    { expiresIn: DURACAO_LINK_SEGUNDOS, audience: "nexa-documento", issuer: "nexa-erp" }
  )
}

function validarTokenVisualizacao(token) {
  const dados = jwt.verify(token, segredoLinkTemporario(), {
    audience: "nexa-documento",
    issuer: "nexa-erp",
  })
  if (dados.tipo !== "nexa-drive-imagem" || !dados.usuarioId || !dados.clienteId || !dados.arquivoId) {
    throw new Error("Link temporário inválido")
  }
  return dados
}

async function visualizarImagemTemporaria({ usuarioId, clienteId, arquivoId }) {
  const { cliente, arquivos } = await arquivosAutorizados({ usuarioId, clienteId })
  const arquivo = arquivos.find((item) => String(item.id) === String(arquivoId || ""))
  if (!arquivo || !MIME_IMAGEM.test(String(arquivo.mimeType || ""))) {
    const erro = new Error("Imagem não encontrada na pasta vinculada a esse cliente")
    erro.status = 404
    throw erro
  }
  const baixado = await baixarArquivoDrive(usuarioId, arquivo)
  return { cliente, arquivo, buffer: baixado.buffer, nome: baixado.nome }
}

module.exports = {
  buscarDocumentosChatGPT,
  baixarDocumentoChatGPT,
  gerarTokenVisualizacao,
  validarTokenVisualizacao,
  visualizarImagemTemporaria,
  termosBusca,
  pontuarArquivo,
}

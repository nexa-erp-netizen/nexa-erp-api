const { Op } = require("sequelize")
const VocabularioVozNexa = require("../models/VocabularioVozNexa")

function normalizarTermo(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function limparTermo(valor, limite = 180) {
  return String(valor || "")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite)
}

function termoValido(valor) {
  const limpo = limparTermo(valor)
  const normalizado = normalizarTermo(limpo)
  if (!limpo || normalizado.length < 2) return false
  if (normalizado.split(" ").length > 12) return false
  return true
}

function escaparRegex(valor) {
  return String(valor || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function listarVocabulario({ usuarioId, clienteId = null, incluirInativos = false } = {}) {
  const where = { usuarioId }
  if (!incluirInativos) where.ativa = true
  if (clienteId) {
    where[Op.or] = [{ clienteId: null }, { clienteId: Number(clienteId) }]
  } else {
    where.clienteId = null
  }

  return VocabularioVozNexa.findAll({
    where,
    order: [["termoOuvidoNormalizado", "ASC"]],
    limit: 500,
  })
}

async function aprenderTermo({ usuarioId, clienteId = null, termoOuvido, termoCorreto, origem = "confirmacao_voz" }) {
  const ouvido = limparTermo(termoOuvido)
  const correto = limparTermo(termoCorreto)
  const ouvidoNormalizado = normalizarTermo(ouvido)
  const corretoNormalizado = normalizarTermo(correto)

  if (!termoValido(ouvido) || !termoValido(correto)) {
    const erro = new Error("Informe o termo ouvido e a forma correta.")
    erro.statusCode = 400
    throw erro
  }

  if (ouvidoNormalizado === corretoNormalizado) {
    return { registrada: false, igual: true, vocabulario: null }
  }

  const [vocabulario, criada] = await VocabularioVozNexa.findOrCreate({
    where: { usuarioId, termoOuvidoNormalizado: ouvidoNormalizado },
    defaults: {
      usuarioId,
      clienteId: clienteId ? Number(clienteId) : null,
      termoOuvido: ouvido,
      termoCorreto: correto,
      termoOuvidoNormalizado: ouvidoNormalizado,
      origem: limparTermo(origem, 40) || "confirmacao_voz",
      confirmada: true,
      ativa: true,
    },
  })

  if (!criada) {
    await vocabulario.update({
      termoOuvido: ouvido,
      termoCorreto: correto,
      clienteId: clienteId ? Number(clienteId) : vocabulario.clienteId,
      origem: limparTermo(origem, 40) || vocabulario.origem,
      confirmada: true,
      ativa: true,
    })
  }

  return { registrada: true, atualizada: !criada, vocabulario }
}

async function aplicarVocabulario({ usuarioId, clienteId = null, texto }) {
  const original = String(texto || "").trim()
  if (!original) return { texto: original, alterada: false, substituicoes: [] }

  const vocabularios = await listarVocabulario({ usuarioId, clienteId })
  const ordenados = [...vocabularios].sort((a, b) => b.termoOuvido.length - a.termoOuvido.length)
  let corrigido = original
  const usados = []

  for (const item of ordenados) {
    const ouvido = String(item.termoOuvido || "").trim()
    const correto = String(item.termoCorreto || "").trim()
    if (!ouvido || !correto) continue

    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaparRegex(ouvido)})(?=$|[^\\p{L}\\p{N}])`, "giu")
    let houveUso = false
    corrigido = corrigido.replace(regex, (trecho, prefixo) => {
      houveUso = true
      return `${prefixo}${correto}`
    })

    if (houveUso) usados.push(item)
  }

  if (usados.length) {
    const agora = new Date()
    await Promise.all(usados.map((item) => item.update({
      usos: Number(item.usos || 0) + 1,
      ultimoUsoEm: agora,
    })))
  }

  return {
    texto: corrigido,
    alterada: corrigido !== original,
    substituicoes: usados.map((item) => ({
      id: item.id,
      ouvido: item.termoOuvido,
      correto: item.termoCorreto,
    })),
  }
}

function detectarInstrucaoDeAprendizado(texto) {
  const mensagem = limparTermo(texto, 500)
  if (!mensagem) return null

  const padroes = [
    /^quando eu disser\s+(.+?)\s*,?\s*(?:estou falando de|quero dizer|significa)\s+(.+?)[.!?]*$/i,
    /^aprenda que\s+(.+?)\s+(?:e|é|significa|quer dizer)\s+(.+?)[.!?]*$/i,
    /^adicione ao vocabulario\s+(.+?)\s+(?:como|para|=)\s+(.+?)[.!?]*$/i,
  ]

  for (const padrao of padroes) {
    const correspondencia = mensagem.match(padrao)
    if (!correspondencia) continue
    const termoOuvido = limparTermo(correspondencia[1])
    const termoCorreto = limparTermo(correspondencia[2])
    if (termoValido(termoOuvido) && termoValido(termoCorreto)) {
      return { termoOuvido, termoCorreto }
    }
  }

  return null
}

module.exports = {
  normalizarTermo,
  listarVocabulario,
  aprenderTermo,
  aplicarVocabulario,
  detectarInstrucaoDeAprendizado,
}

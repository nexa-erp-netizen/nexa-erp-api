const ConversaNexa = require("../models/ConversaNexa")
const MensagemNexa = require("../models/MensagemNexa")
const MemoriaNexa = require("../models/MemoriaNexa")
const { ativarConversa, obterConversaAtiva } = require("../services/conversaAtivaService")

function tituloAutomatico(texto) {
  const limpo = String(texto || "Nova conversa").replace(/\s+/g, " ").trim()
  if (!limpo) return "Nova conversa"
  return limpo.length > 52 ? `${limpo.slice(0, 49)}...` : limpo
}

async function listarConversas(req, res) {
  try {
    const conversas = await ConversaNexa.findAll({
      where: { usuarioId: req.usuario.id, arquivada: false },
      order: [["ultimaMensagemEm", "DESC"], ["updatedAt", "DESC"]],
      limit: 100,
    })
    return res.json(conversas)
  } catch (error) {
    console.error("ERRO AO LISTAR CONVERSAS DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao listar conversas" })
  }
}

async function criarConversa(req, res) {
  try {
    const tipoContexto = ["geral", "cliente", "interessado"].includes(req.body?.tipoContexto)
      ? req.body.tipoContexto
      : "geral"
    const conversa = await ConversaNexa.create({
      usuarioId: req.usuario.id,
      titulo: String(req.body?.titulo || "Nova conversa").trim() || "Nova conversa",
      tipoContexto,
      clienteId: req.body?.clienteId ? Number(req.body.clienteId) : null,
      interessadoNome: tipoContexto === "interessado" ? String(req.body?.interessadoNome || "Novo atendimento").trim() : null,
      ultimaMensagemEm: new Date(),
    })
    await ativarConversa(req.usuario.id, conversa)
    return res.status(201).json(conversa)
  } catch (error) {
    console.error("ERRO AO CRIAR CONVERSA DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao criar conversa" })
  }
}

async function obterMensagens(req, res) {
  try {
    const conversa = await ConversaNexa.findOne({ where: { id: req.params.id, usuarioId: req.usuario.id } })
    if (!conversa) return res.status(404).json({ message: "Conversa não encontrada" })

    const mensagensRecentes = await MensagemNexa.findAll({
      where: { conversaId: conversa.id, usuarioId: req.usuario.id },
      order: [["createdAt", "DESC"]],
      limit: 120,
    })
    const mensagens = mensagensRecentes.reverse()
    return res.json({ conversa, mensagens })
  } catch (error) {
    console.error("ERRO AO ABRIR CONVERSA DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao abrir conversa" })
  }
}

async function obterConversaRecente(req, res) {
  try {
    const conversa = await obterConversaAtiva(req.usuario.id)
    if (!conversa) return res.json({ conversa: null, mensagens: [] })
    const mensagensRecentes = await MensagemNexa.findAll({
      where: { conversaId: conversa.id, usuarioId: req.usuario.id },
      order: [["createdAt", "DESC"]],
      limit: 120,
    })
    const mensagens = mensagensRecentes.reverse()
    return res.json({ conversa, mensagens })
  } catch (error) {
    console.error("ERRO AO ABRIR CONVERSA RECENTE DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao abrir a conversa mais recente" })
  }
}

async function definirConversaAtiva(req, res) {
  try {
    const conversa = await ativarConversa(req.usuario.id, Number(req.params.id))
    if (!conversa) return res.status(404).json({ message: "Conversa não encontrada" })
    return res.json(conversa)
  } catch (error) {
    console.error("ERRO AO DEFINIR CONVERSA ATIVA DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao sincronizar a conversa ativa" })
  }
}

async function atualizarConversa(req, res) {
  try {
    const conversa = await ConversaNexa.findOne({ where: { id: req.params.id, usuarioId: req.usuario.id } })
    if (!conversa) return res.status(404).json({ message: "Conversa não encontrada" })

    const alteracoes = {}
    if (req.body?.titulo !== undefined) alteracoes.titulo = tituloAutomatico(req.body.titulo)
    if (req.body?.arquivada !== undefined) alteracoes.arquivada = Boolean(req.body.arquivada)
    if (["geral", "cliente", "interessado"].includes(req.body?.tipoContexto)) alteracoes.tipoContexto = req.body.tipoContexto
    if (req.body?.clienteId !== undefined) alteracoes.clienteId = req.body.clienteId ? Number(req.body.clienteId) : null
    if (req.body?.interessadoNome !== undefined) alteracoes.interessadoNome = String(req.body.interessadoNome || "").trim() || null

    await conversa.update(alteracoes)
    return res.json(conversa)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR CONVERSA DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao atualizar conversa" })
  }
}

async function excluirConversa(req, res) {
  try {
    const conversa = await ConversaNexa.findOne({ where: { id: req.params.id, usuarioId: req.usuario.id } })
    if (!conversa) return res.status(404).json({ message: "Conversa não encontrada" })

    await MensagemNexa.destroy({ where: { conversaId: conversa.id, usuarioId: req.usuario.id } })
    await MemoriaNexa.update({ ativa: false }, { where: { conversaId: conversa.id, usuarioId: req.usuario.id } })
    await conversa.destroy()
    return res.json({ message: "Conversa excluída" })
  } catch (error) {
    console.error("ERRO AO EXCLUIR CONVERSA DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao excluir conversa" })
  }
}

async function listarMemorias(req, res) {
  try {
    const where = { usuarioId: req.usuario.id, ativa: true }
    if (req.query.escopo) where.escopo = String(req.query.escopo)
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.conversaId) where.conversaId = Number(req.query.conversaId)

    const memorias = await MemoriaNexa.findAll({ where, order: [["updatedAt", "DESC"]], limit: 200 })
    return res.json(memorias)
  } catch (error) {
    console.error("ERRO AO LISTAR MEMÓRIAS DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao listar memórias" })
  }
}

async function excluirMemoria(req, res) {
  try {
    const memoria = await MemoriaNexa.findOne({ where: { id: req.params.id, usuarioId: req.usuario.id } })
    if (!memoria) return res.status(404).json({ message: "Memória não encontrada" })
    await memoria.update({ ativa: false })
    return res.json({ message: "Memória removida" })
  } catch (error) {
    console.error("ERRO AO EXCLUIR MEMÓRIA DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao excluir memória" })
  }
}

module.exports = {
  listarConversas,
  criarConversa,
  obterMensagens,
  obterConversaRecente,
  definirConversaAtiva,
  atualizarConversa,
  excluirConversa,
  listarMemorias,
  excluirMemoria,
  tituloAutomatico,
}

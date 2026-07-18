const VocabularioVozNexa = require("../models/VocabularioVozNexa")
const {
  listarVocabulario,
  aprenderTermo,
} = require("../services/vocabularioVozService")

async function listar(req, res) {
  try {
    const clienteId = req.query?.clienteId ? Number(req.query.clienteId) : null
    const itens = await listarVocabulario({ usuarioId: req.usuario.id, clienteId })
    return res.json(itens)
  } catch (error) {
    console.error("ERRO AO LISTAR VOCABULÁRIO DE VOZ:", error)
    return res.status(500).json({ message: "Erro ao listar vocabulário de voz" })
  }
}

async function aprender(req, res) {
  try {
    const resultado = await aprenderTermo({
      usuarioId: req.usuario.id,
      clienteId: req.body?.clienteId || null,
      termoOuvido: req.body?.termoOuvido,
      termoCorreto: req.body?.termoCorreto,
      origem: req.body?.origem || "confirmacao_voz",
    })

    if (resultado.igual) {
      return res.json({
        registrada: false,
        message: "Os dois termos já são iguais.",
      })
    }

    return res.status(resultado.atualizada ? 200 : 201).json({
      registrada: true,
      atualizada: Boolean(resultado.atualizada),
      vocabulario: resultado.vocabulario,
      message: `Vou reconhecer “${resultado.vocabulario.termoOuvido}” como “${resultado.vocabulario.termoCorreto}”.`,
    })
  } catch (error) {
    console.error("ERRO AO APRENDER VOCABULÁRIO DE VOZ:", error)
    return res.status(error.statusCode || 500).json({
      message: error.message || "Erro ao registrar vocabulário de voz",
    })
  }
}

async function atualizar(req, res) {
  try {
    const item = await VocabularioVozNexa.findOne({
      where: { id: req.params.id, usuarioId: req.usuario.id },
    })
    if (!item) return res.status(404).json({ message: "Termo não encontrado" })

    const resultado = await aprenderTermo({
      usuarioId: req.usuario.id,
      clienteId: req.body?.clienteId ?? item.clienteId,
      termoOuvido: req.body?.termoOuvido || item.termoOuvido,
      termoCorreto: req.body?.termoCorreto || item.termoCorreto,
      origem: "edicao_usuario",
    })

    if (resultado.vocabulario.id !== item.id) await item.update({ ativa: false })
    return res.json(resultado.vocabulario)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR VOCABULÁRIO DE VOZ:", error)
    return res.status(error.statusCode || 500).json({ message: error.message || "Erro ao atualizar termo" })
  }
}

async function excluir(req, res) {
  try {
    const item = await VocabularioVozNexa.findOne({
      where: { id: req.params.id, usuarioId: req.usuario.id },
    })
    if (!item) return res.status(404).json({ message: "Termo não encontrado" })
    await item.update({ ativa: false })
    return res.json({ message: "Termo removido do vocabulário" })
  } catch (error) {
    console.error("ERRO AO EXCLUIR VOCABULÁRIO DE VOZ:", error)
    return res.status(500).json({ message: "Erro ao remover termo" })
  }
}

module.exports = { listar, aprender, atualizar, excluir }

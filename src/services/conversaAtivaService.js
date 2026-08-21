const ConversaNexa = require("../models/ConversaNexa")

async function ativarConversa(usuarioId, conversaOuId) {
  const conversa = typeof conversaOuId === "object"
    ? conversaOuId
    : await ConversaNexa.findOne({ where: { id: conversaOuId, usuarioId, arquivada: false } })
  if (!conversa || Number(conversa.usuarioId) !== Number(usuarioId)) return null
  await ConversaNexa.update({ ativa: false }, { where: { usuarioId, ativa: true } })
  if (!conversa.ativa) await conversa.update({ ativa: true })
  return conversa
}

async function obterConversaAtiva(usuarioId) {
  let conversa = await ConversaNexa.findOne({ where: { usuarioId, arquivada: false, ativa: true }, order: [["updatedAt", "DESC"]] })
  if (conversa) return conversa
  conversa = await ConversaNexa.findOne({ where: { usuarioId, arquivada: false }, order: [["ultimaMensagemEm", "DESC"], ["updatedAt", "DESC"]] })
  return conversa ? ativarConversa(usuarioId, conversa) : null
}

module.exports = { ativarConversa, obterConversaAtiva }

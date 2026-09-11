const test = require("node:test")
const assert = require("node:assert/strict")

const { _test } = require("../src/controllers/conversaController")
const ConversaNexa = require("../src/models/ConversaNexa")
const conversaAtivaService = require("../src/services/conversaAtivaService")

test("orienta o responsável do escritório sem mandá-lo procurar um contador", () => {
  const instrucoes = _test.instrucoesNexa("Fabio")
  assert.match(instrucoes, /responsável pelo atendimento no escritório/i)
  assert.match(instrucoes, /Nunca mande o usuário procurar.*contador/i)
  assert.match(instrucoes, /próximo passo concreto/i)
})

test("mantém a conversa explicitamente selecionada mesmo quando outra está ativa", async (t) => {
  const escolhida = {
    id: 44,
    titulo: "Jarede — Retificação IRPF",
    tipoContexto: "cliente",
    clienteId: 17,
    interessadoNome: null,
    update: async () => {},
  }

  t.mock.method(ConversaNexa, "findOne", async ({ where }) => {
    assert.deepEqual(where, { id: 44, usuarioId: 9, arquivada: false })
    return escolhida
  })
  t.mock.method(ConversaNexa, "update", async () => [1])
  t.mock.method(conversaAtivaService, "obterConversaAtiva", async () => {
    throw new Error("não deve buscar outra conversa ativa")
  })

  const conversa = await _test.obterOuCriarConversa({
    usuarioId: 9,
    conversaId: 44,
    tipoContexto: "cliente",
    clienteId: 17,
    primeiraMensagem: "Recebi o relatório da dona Jarede",
  })

  assert.equal(conversa.id, 44)
  assert.equal(conversa.clienteId, 17)
})

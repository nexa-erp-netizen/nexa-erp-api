const test = require("node:test")
const assert = require("node:assert/strict")
const { intencaoReceberCobranca } = require("../src/services/nexaFinancialActionsService")

test("reconhece correção de honorários pagos", () => {
  assert.equal(intencaoReceberCobranca("Corrija os honorários de agosto para recebido"), true)
  assert.equal(intencaoReceberCobranca("Marque esta cobrança como paga"), true)
})

test("não confunde consulta com alteração financeira", () => {
  assert.equal(intencaoReceberCobranca("Quais honorários estão atrasados?"), false)
  assert.equal(intencaoReceberCobranca("Explique o que significa recebido"), false)
})

const test = require("node:test")
const assert = require("node:assert/strict")
const { classificarFormaRecebimento } = require("../src/services/formaRecebimentoExtratoService")

test("identifica recebimentos PIX pela descrição bancária", () => {
  assert.equal(classificarFormaRecebimento({ descricao: "PIX RECEBIDO MARIA" }), "PIX")
  assert.equal(classificarFormaRecebimento({ descricao: "Transf Pix recebida" }), "PIX")
})

test("identifica liquidações de cartão pelas adquirentes", () => {
  assert.equal(classificarFormaRecebimento({ descricao: "STONE PAGAMENTOS" }), "Cartão")
  assert.equal(classificarFormaRecebimento({ descricao: "CIELO LIQUIDACAO" }), "Cartão")
  assert.equal(classificarFormaRecebimento({ descricao: "InfinitePay recebimento" }), "Cartão")
})

test("não adivinha forma sem evidência na descrição", () => {
  assert.equal(classificarFormaRecebimento({ descricao: "TED RECEBIDA" }), null)
  assert.equal(classificarFormaRecebimento({ descricao: "DEPÓSITO EM CONTA" }), null)
})

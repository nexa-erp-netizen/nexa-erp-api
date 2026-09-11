const test = require("node:test")
const assert = require("node:assert/strict")

process.env.JWT_SECRET ||= "teste"
const piloto = require("../src/services/nexaInteligenciaPilotoService")

test("estima tokens de forma conservadora", () => {
  assert.equal(piloto._test.estimarTokens("123456"), 2)
})

test("calcula custo configurado por milhão de tokens", () => {
  const custo = piloto._test.custoUsd(1_000_000, 1_000_000)
  assert.ok(custo > 0)
})

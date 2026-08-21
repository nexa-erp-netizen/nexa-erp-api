const test = require("node:test")
const assert = require("node:assert/strict")
const { competenciaDaMensagem, pareceDiagnosticoSaldoAnterior } = require("../src/services/nexaAutodiagnosticoService")

test("reconhece pergunta natural sobre erro no saldo anterior", () => {
  assert.equal(pareceDiagnosticoSaldoAnterior("Por que apareceu esse saldo anterior errado?"), true)
  assert.equal(pareceDiagnosticoSaldoAnterior("Qual é o saldo?"), false)
})

test("interpreta competência escrita de formas diferentes", () => {
  assert.equal(competenciaDaMensagem("verifique agosto de 2026"), "2026-08")
  assert.equal(competenciaDaMensagem("diagnostique 9/2026"), "2026-09")
})

const test = require("node:test")
const assert = require("node:assert/strict")
const { calcularSaldoAnterior, diagnosticarSaldoAnterior } = require("../src/services/saldoConciliacaoService")

test("não inclui movimentos anteriores ao início do controle da conta", () => {
  const resultado = calcularSaldoAnterior({
    saldoInicial: 0,
    dataSaldoInicial: "2026-09-01",
    inicioCompetencia: "2026-10-01",
    movimentos: [
      { id: 1, data: "2026-08-20", valorAssinado: 100.91 },
      { id: 2, data: "2026-09-10", valorAssinado: 50 },
    ],
  })
  assert.equal(resultado.saldoAnterior, 50)
  assert.deepEqual(resultado.movimentosConsiderados.map(item => item.id), [2])
  assert.deepEqual(resultado.movimentosAnterioresAoMarco.map(item => item.id), [1])
})

test("preserva o saldo inicial cadastrado e soma apenas movimentos válidos", () => {
  const resultado = calcularSaldoAnterior({
    saldoInicial: 190,
    dataSaldoInicial: "2026-09-01",
    inicioCompetencia: "2026-10-01",
    movimentos: [{ data: "2026-09-15", valorAssinado: -40 }],
  })
  assert.equal(resultado.saldoAnterior, 150)
})

test("diagnóstico aponta causa sem apagar o movimento histórico", () => {
  const movimento = { id: 7, data: "2026-08-15", valorAssinado: 100.91 }
  const diagnostico = diagnosticarSaldoAnterior({
    saldoInicial: 0,
    dataSaldoInicial: "2026-09-01",
    inicioCompetencia: "2026-09-01",
    movimentos: [movimento],
  })
  assert.equal(diagnostico.inconsistente, true)
  assert.equal(diagnostico.saldoAnterior, 0)
  assert.equal(diagnostico.movimentosAnterioresAoMarco[0], movimento)
})

test("mantém compatibilidade quando a conta ainda não tem marco inicial", () => {
  const resultado = calcularSaldoAnterior({
    saldoInicial: 0,
    inicioCompetencia: "2026-10-01",
    movimentos: [{ data: "2026-08-15", valorAssinado: 100.91 }],
  })
  assert.equal(resultado.saldoAnterior, 100.91)
})

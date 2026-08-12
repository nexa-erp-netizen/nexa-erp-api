const test = require("node:test")
const assert = require("node:assert/strict")

const { extrairCompetencia, identificarEscopo } = require("../src/services/regimeParserService")

test("entende confirmação interna com mês por extenso", () => {
  assert.equal(identificarEscopo("Somente atualizar na Nexa, a partir de agosto de 2026"), "cadastro-interno")
  assert.deepEqual(extrairCompetencia("Somente atualizar na Nexa, a partir de agosto de 2026"), {
    competencia: "2026-08",
    dataInicio: "2026-08-01",
  })
})

test("entende competências numéricas nos dois formatos", () => {
  assert.equal(extrairCompetencia("a partir de 09/2026").competencia, "2026-09")
  assert.equal(extrairCompetencia("a partir de 2026-10").competencia, "2026-10")
})

test("distingue processo real de atualização interna", () => {
  assert.equal(identificarEscopo("Quero fazer o processo real no governo em agosto de 2026"), "processo-real")
  assert.equal(identificarEscopo("a partir de agosto de 2026"), null)
})

const test = require("node:test")
const assert = require("node:assert/strict")
const { normalizarDataMovimento, competenciaDaData } = require("../src/services/dataMovimentoService")

test("aceita data operacional válida", () => {
  assert.deepEqual(normalizarDataMovimento("2026-08-20", 2026), { valida: true, corrigida: false, data: "2026-08-20" })
  assert.equal(competenciaDaData("2026-08-20", 2026), "08/2026")
})

test("corrige o erro legado de ano 0226 para 2026", () => {
  assert.deepEqual(normalizarDataMovimento("0226-08-20", 2026), { valida: true, corrigida: true, data: "2026-08-20" })
})

test("bloqueia datas impossíveis ou anos não plausíveis", () => {
  assert.equal(normalizarDataMovimento("2026-02-31", 2026).valida, false)
  assert.equal(normalizarDataMovimento("1800-08-20", 2026).valida, false)
  assert.equal(normalizarDataMovimento("2099-08-20", 2026).valida, false)
  assert.equal(normalizarDataMovimento("texto", 2026).valida, false)
})

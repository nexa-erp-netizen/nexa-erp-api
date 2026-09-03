const test = require("node:test")
const assert = require("node:assert/strict")

const {
  hashDaChave,
  ehConflitoDeIdempotencia,
  respostaPersistida,
} = require("../src/services/idempotenciaService")

test("gera hash estável sem persistir a chave original", () => {
  const primeira = hashDaChave("escritorio:usuario:chave-123")
  const segunda = hashDaChave("escritorio:usuario:chave-123")

  assert.equal(primeira, segunda)
  assert.equal(primeira.length, 64)
  assert.notEqual(primeira, "escritorio:usuario:chave-123")
})

test("reconhece conflito somente na chave idempotente", () => {
  assert.equal(ehConflitoDeIdempotencia({
    name: "SequelizeUniqueConstraintError",
    fields: { chaveHash: "abc" },
  }), true)

  assert.equal(ehConflitoDeIdempotencia({
    name: "SequelizeUniqueConstraintError",
    fields: { email: "x@y.com" },
  }), false)
})

test("recupera resposta persistida apenas quando válida", () => {
  assert.deepEqual(
    respostaPersistida({ resposta: { movimentos: [{ id: 1 }] } }),
    { movimentos: [{ id: 1 }] }
  )
  assert.equal(respostaPersistida({ resposta: null }), null)
})

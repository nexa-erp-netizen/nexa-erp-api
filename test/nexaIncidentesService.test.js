const test = require("node:test")
const assert = require("node:assert/strict")
const { pareceConsultaIncidentes } = require("../src/services/nexaIncidentesService")

test("reconhece consultas naturais sobre erros do sistema", () => {
  assert.equal(pareceConsultaIncidentes("Nexa, quais erros aconteceram no sistema hoje?"), true)
  assert.equal(pareceConsultaIncidentes("Tem alguma falha aberta na API?"), true)
  assert.equal(pareceConsultaIncidentes("Explique o que é um erro de português"), false)
  assert.equal(pareceConsultaIncidentes("Detalhe o incidente #12"), true)
})

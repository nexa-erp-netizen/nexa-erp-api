const test = require("node:test")
const assert = require("node:assert/strict")
const { avaliarNaturezaIncidente } = require("../src/services/nexaModoDesenvolvedorService")

test("classifica falha de comunicação antiga como temporária quando o sistema voltou", () => {
  const resultado = avaliarNaturezaIncidente({
    titulo: "Falha ao acessar /conversa",
    statusHttp: 502,
    ocorrencias: 1,
    ultimaOcorrenciaEm: "2026-08-24T13:00:01.000Z",
  }, { api: "online", banco: "conectado", incidentesCriticos: 0 }, new Date("2026-08-24T18:12:00.000Z"))
  assert.equal(resultado.tipo, "Falha temporária")
  assert.equal(resultado.precisaCorrecaoCodigo, false)
})

test("não chama falha repetida de temporária", () => {
  const resultado = avaliarNaturezaIncidente({
    titulo: "Falha interna da API",
    statusHttp: 500,
    ocorrencias: 3,
    ultimaOcorrenciaEm: "2026-08-24T18:10:00.000Z",
  }, { api: "online", banco: "conectado", incidentesCriticos: 0 }, new Date("2026-08-24T18:12:00.000Z"))
  assert.equal(resultado.tipo, "Falha recorrente")
  assert.equal(resultado.precisaCorrecaoCodigo, true)
})

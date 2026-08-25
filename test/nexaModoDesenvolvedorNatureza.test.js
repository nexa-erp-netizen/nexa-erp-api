const test = require("node:test")
const assert = require("node:assert/strict")
const { avaliarNaturezaIncidente, pareceComandoDesenvolvedor } = require("../src/services/nexaModoDesenvolvedorService")

test("reconhece o fluxo completo de plano conversacional", () => {
  assert.equal(pareceComandoDesenvolvedor("Prepare a correção do plano #18"), true)
  assert.equal(pareceComandoDesenvolvedor("Valide a publicação do plano #18"), true)
  assert.equal(pareceComandoDesenvolvedor("O que falta para concluir o modo desenvolvedor?"), true)
})

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

test("respeita a classificação temporária já registrada", () => {
  const resultado = avaliarNaturezaIncidente({
    titulo: "Falha em POST /conversa",
    statusHttp: 500,
    tipoFalha: "Temporária",
    causaProvavel: "A API interrompeu a operação por uma exceção interna.",
    ocorrencias: 1,
    ultimaOcorrenciaEm: "2026-08-24T13:00:01.000Z",
  }, { api: "online", banco: "conectado", incidentesCriticos: 2 }, new Date("2026-08-24T18:35:00.000Z"))
  assert.equal(resultado.tipo, "Falha temporária")
  assert.equal(resultado.precisaCorrecaoCodigo, false)
  assert.doesNotMatch(resultado.conclusao, /exceção interna/i)
})

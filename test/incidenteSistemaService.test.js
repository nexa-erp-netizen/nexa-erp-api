const test = require("node:test")
const assert = require("node:assert/strict")
const { fingerprint, nivelDoIncidente, sanear, textoSeguro } = require("../src/services/incidenteSistemaService")

test("remove credenciais e documentos do contexto do incidente", () => {
  const resultado = sanear({ token: "segredo", cpf: "12345678901", dados: { Authorization: "Bearer abc.123", mensagem: "CPF 12345678901" } })
  assert.equal(resultado.token, "[PROTEGIDO]")
  assert.equal(resultado.cpf, "[PROTEGIDO]")
  assert.equal(resultado.dados.Authorization, "[PROTEGIDO]")
  assert.equal(resultado.dados.mensagem, "CPF [DOCUMENTO PROTEGIDO]")
})

test("agrupa o mesmo erro por fingerprint estável", () => {
  const dados = { origem: "api", metodo: "GET", rota: "/clientes", statusHttp: 500, mensagem: "Falha interna" }
  assert.equal(fingerprint(dados), fingerprint({ ...dados }))
})

test("classifica falhas internas e runtime como críticas", () => {
  assert.equal(nivelDoIncidente(500, "api"), "Crítico")
  assert.equal(nivelDoIncidente(0, "web-runtime"), "Crítico")
  assert.equal(textoSeguro("Bearer abc.def"), "Bearer [PROTEGIDO]")
})

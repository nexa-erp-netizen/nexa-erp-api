const test = require("node:test")
const assert = require("node:assert/strict")
const { diagnosticarIncidente } = require("../src/services/motorDiagnosticoIncidenteService")

test("diagnostica modelo de IA descontinuado com alta confiança", () => {
  const resultado = diagnosticarIncidente({ mensagem: "The model llama-3.3-70b-versatile does not exist or you do not have access to it" })
  assert.equal(resultado.categoria, "Configuração de IA")
  assert.equal(resultado.autocorrecaoPermitida, true)
  assert.equal(resultado.confianca, 98)
})

test("bloqueia autocorreção de banco e permissões", () => {
  assert.equal(diagnosticarIncidente({ mensagem: "Sequelize database constraint error" }).autocorrecaoPermitida, false)
  assert.equal(diagnosticarIncidente({ statusHttp: 403 }).risco, "Alto")
})

test("classifica erro de componente Web", () => {
  const resultado = diagnosticarIncidente({ origem: "web-runtime", mensagem: "Cannot read properties of undefined" })
  assert.equal(resultado.categoria, "Interface Web")
})

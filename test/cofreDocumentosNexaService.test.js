const test = require("node:test")
const assert = require("node:assert/strict")

process.env.NEXA_DOCUMENT_KEY = "chave-de-teste-documental-com-tamanho-seguro"
const { criptografarDocumento, descriptografarDocumento } = require("../src/services/cofreDocumentosNexaService")

test("protege e recupera o texto documental", () => {
  const original = "CNPJ 12.345.678/0001-90 - vencimento 20/08/2026 - R$ 86,05"
  const protegido = criptografarDocumento(original)
  assert.notEqual(protegido, original)
  assert.equal(descriptografarDocumento(protegido), original)
})

test("detecta adulteração do conteúdo protegido", () => {
  const protegido = criptografarDocumento("documento original")
  const adulterado = `${protegido.slice(0, -2)}aa`
  assert.throws(() => descriptografarDocumento(adulterado))
})

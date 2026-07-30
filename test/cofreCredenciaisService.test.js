const test = require("node:test")
const assert = require("node:assert/strict")

process.env.CREDENCIAIS_MASTER_KEY = Buffer.alloc(32, 7).toString("base64")
const { criptografar, descriptografar, chaveConfigurada } = require("../src/services/cofreCredenciaisService")

test("cofre usa conteúdo autenticado e recupera texto", () => {
  const protegido = criptografar("segredo fiscal")
  assert.match(protegido, /^v1\./)
  assert.notEqual(protegido, "segredo fiscal")
  assert.equal(descriptografar(protegido).toString("utf8"), "segredo fiscal")
  assert.equal(chaveConfigurada(), true)
})

test("cofre detecta adulteração", () => {
  const protegido = criptografar(Buffer.from([1, 2, 3]))
  const alterado = `${protegido.slice(0, -2)}AA`
  assert.throws(() => descriptografar(alterado))
})

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("fs")
const os = require("os")
const path = require("path")

const {
  normalizarNomeTabela,
  listarArquivosMigracao,
  checksumArquivo,
  validarChecksumAplicado,
} = require("../src/db/migrationService")

test("normaliza nomes de tabela retornados pelo Sequelize", () => {
  assert.equal(normalizarNomeTabela("Clientes"), "Clientes")
  assert.equal(normalizarNomeTabela({ tableName: "Clientes" }), "Clientes")
})

test("lista migrations em ordem e ignora arquivos fora do padrão", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexa-migrations-"))
  fs.writeFileSync(path.join(dir, "202609040002_segunda.js"), "module.exports={up(){}}")
  fs.writeFileSync(path.join(dir, "README.md"), "ignorar")
  fs.writeFileSync(path.join(dir, "202609040001_primeira.js"), "module.exports={up(){}}")

  const nomes = listarArquivosMigracao(dir).map(item => path.basename(item))
  assert.deepEqual(nomes, ["202609040001_primeira.js", "202609040002_segunda.js"])
})

test("checksum de migration é estável e muda quando o arquivo muda", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexa-migration-checksum-"))
  const arquivo = path.join(dir, "202609040001_teste.js")
  fs.writeFileSync(arquivo, "abc")
  const primeiro = checksumArquivo(arquivo)
  const segundo = checksumArquivo(arquivo)
  assert.equal(primeiro, segundo)

  fs.writeFileSync(arquivo, "abcd")
  assert.notEqual(checksumArquivo(arquivo), primeiro)
})

test("bloqueia alteração de migration já aplicada", () => {
  assert.equal(validarChecksumAplicado(null, "abc", "m1.js"), "pendente")
  assert.equal(validarChecksumAplicado({ checksum: "abc" }, "abc", "m1.js"), "aplicada")
  assert.throws(
    () => validarChecksumAplicado({ checksum: "abc" }, "def", "m1.js"),
    /Migration já aplicada foi alterada/
  )
})

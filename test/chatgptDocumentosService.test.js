const test = require("node:test")
const assert = require("node:assert/strict")
const { termosBusca, pontuarArquivo } = require("../src/services/chatgptDocumentosService")

test("remove o nome do cliente e verbos da busca de documentos", () => {
  assert.deepEqual(
    termosBusca("Envie o DAS de julho da Daiane", { nome: "Daiane Ferreira" }),
    ["das", "julho"],
  )
})

test("prioriza arquivo que contém tipo e competência solicitados", () => {
  const termos = ["das", "julho", "2026"]
  const correto = pontuarArquivo({ name: "DAS julho 2026.pdf" }, termos)
  const incorreto = pontuarArquivo({ name: "Contrato social.pdf" }, termos)
  assert.ok(correto.pontos > incorreto.pontos)
  assert.equal(correto.correspondencias, 3)
})

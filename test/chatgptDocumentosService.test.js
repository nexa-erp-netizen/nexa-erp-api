const test = require("node:test")
const assert = require("node:assert/strict")
const {
  termosBusca,
  pontuarArquivo,
  gerarTokenVisualizacao,
  validarTokenVisualizacao,
} = require("../src/services/chatgptDocumentosService")

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

test("link temporário preserva usuário, cliente e arquivo autorizados", () => {
  const segredoAnterior = process.env.NEXA_DOCUMENT_LINK_SECRET
  process.env.NEXA_DOCUMENT_LINK_SECRET = "segredo-de-teste-com-tamanho-suficiente"
  try {
    const token = gerarTokenVisualizacao({ usuarioId: 7, clienteId: 31, arquivoId: "drive-abc" })
    const dados = validarTokenVisualizacao(token)
    assert.equal(dados.usuarioId, 7)
    assert.equal(dados.clienteId, 31)
    assert.equal(dados.arquivoId, "drive-abc")
  } finally {
    if (segredoAnterior === undefined) delete process.env.NEXA_DOCUMENT_LINK_SECRET
    else process.env.NEXA_DOCUMENT_LINK_SECRET = segredoAnterior
  }
})

test("link temporário adulterado é rejeitado", () => {
  const segredoAnterior = process.env.NEXA_DOCUMENT_LINK_SECRET
  process.env.NEXA_DOCUMENT_LINK_SECRET = "segredo-de-teste-com-tamanho-suficiente"
  try {
    const token = gerarTokenVisualizacao({ usuarioId: 7, clienteId: 31, arquivoId: "drive-abc" })
    assert.throws(() => validarTokenVisualizacao(`${token.slice(0, -1)}x`))
  } finally {
    if (segredoAnterior === undefined) delete process.env.NEXA_DOCUMENT_LINK_SECRET
    else process.env.NEXA_DOCUMENT_LINK_SECRET = segredoAnterior
  }
})

const test = require("node:test")
const assert = require("node:assert/strict")

const {
  caminhoPermitido,
  selecionarCandidatos,
  validarAlteracoes,
  tipoRepositorio,
} = require("../src/services/nexaCodigoAutonomoService")

test("separa incidentes da Web e da API", () => {
  assert.equal(tipoRepositorio({ origem: "web", categoria: "Interface", componente: "Clientes.jsx" }), "web")
  assert.equal(tipoRepositorio({ origem: "api", categoria: "Runtime", componente: "conversaController.js" }), "api")
})

test("permite código comum e bloqueia áreas sensíveis", () => {
  assert.equal(caminhoPermitido("src/services/nexaActionsService.js", "api"), true)
  assert.equal(caminhoPermitido("src/components/NexaVoiceListener.jsx", "web"), true)
  assert.equal(caminhoPermitido("src/middlewares/authMiddleware.js", "api"), false)
  assert.equal(caminhoPermitido("src/models/Cliente.js", "api"), false)
  assert.equal(caminhoPermitido("package.json", "api"), false)
  assert.equal(caminhoPermitido(".github/workflows/teste.yml", "api"), false)
})

test("prioriza o arquivo citado na pilha do incidente", () => {
  const arquivos = ["src/services/outroService.js", "src/services/nexaActionsService.js", "src/models/Cliente.js"]
  const incidente = { titulo: "Falha ao confirmar", contexto: { stack: "/opt/render/project/src/src/services/nexaActionsService.js:458:2" } }
  assert.equal(selecionarCandidatos(arquivos, incidente, "api")[0], "src/services/nexaActionsService.js")
})

test("aceita correção pequena em arquivo existente", () => {
  const originais = [{ caminho: "src/services/testeService.js", conteudo: "module.exports = false\n" }]
  const arquivos = validarAlteracoes({ arquivos: [{ caminho: "src/services/testeService.js", conteudo: "module.exports = true\n" }] }, originais, "api")
  assert.equal(arquivos.length, 1)
})

test("recusa arquivo novo, credencial e alteração extensa", () => {
  const originais = [{ caminho: "src/services/testeService.js", conteudo: "module.exports = false\n" }]
  assert.throws(() => validarAlteracoes({ arquivos: [{ caminho: "src/services/novo.js", conteudo: "novo" }] }, originais, "api"), /Nenhuma mudança segura/)
  assert.throws(() => validarAlteracoes({ arquivos: [{ caminho: "src/services/testeService.js", conteudo: "const token = process.env.API_SECRET\n" }] }, originais, "api"), /credenciais/)
  assert.throws(() => validarAlteracoes({ arquivos: [{ caminho: "src/services/testeService.js", conteudo: "x".repeat(130000) }] }, originais, "api"), /grande demais/)
})

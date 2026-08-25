const test = require("node:test")
const assert = require("node:assert/strict")

const {
  caminhoPermitido,
  selecionarCandidatos,
  validarAlteracoes,
  tipoRepositorio,
  pedidoPrepararCodigo,
  pedidoPublicarCodigo,
  pedidoStatusCodigo,
  pedidoValidarPublicacao,
  pedidoConversaTecnica,
  pedidoAcessoArquivos,
  pedidoAnalisarCodigo,
  repositoriosNaMensagem,
  selecionarArquivosParaAnalise,
  pedidoSemRestricaoDaAnalise,
} = require("../src/services/nexaCodigoAutonomoService")

test("separa incidentes da Web e da API", () => {
  assert.equal(tipoRepositorio({ origem: "web", categoria: "Interface", componente: "Clientes.jsx" }), "web")
  assert.equal(tipoRepositorio({ origem: "api", categoria: "Runtime", componente: "conversaController.js" }), "api")
})

test("negação impede preparar ou publicar correção", () => {
  assert.equal(pedidoPrepararCodigo("Prepare a correção do incidente #3"), true)
  assert.equal(pedidoPrepararCodigo("Prepare a correção do plano #2. Não publique ainda."), true)
  assert.equal(pedidoPrepararCodigo("Diagnostique o incidente #3. Não prepare nem publique correção"), false)
  assert.equal(pedidoPrepararCodigo("Analise o erro sem alterar nem preparar correção"), false)
  assert.equal(pedidoPublicarCodigo("Não prepare nem publique correção"), false)
  assert.equal(pedidoStatusCodigo("Diagnostique o incidente #3. Não prepare nem publique correção"), false)
  assert.equal(pedidoPublicarCodigo("Confirmo, publique o plano #4"), true)
  assert.equal(pedidoPublicarCodigo("Confirmo que os testes falharam"), false)
  assert.equal(pedidoPublicarCodigo("Autorizo a publicação do plano #4"), true)
})

test("restrição da análise não bloqueia a preparação posterior", () => {
  const pedido = pedidoSemRestricaoDaAnalise("Analise o layout. Não altere nada. Não publique.")
  assert.equal(/não altere|nao altere|não publique|nao publique/i.test(pedido), false)
  assert.match(pedido, /Analise o layout/i)
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

test("aplica substituição pequena e única sem exigir o arquivo inteiro da IA", () => {
  const originais = [{ caminho: "src/pages/Clientes.jsx", conteudo: "const titulo = 'Clientes'\nconst ativo = false\n" }]
  const arquivos = validarAlteracoes({ arquivos: [{ caminho: "src/pages/Clientes.jsx", operacoes: [{ buscar: "const ativo = false", substituir: "const ativo = true" }] }] }, originais, "web")
  assert.equal(arquivos[0].conteudo.includes("const ativo = true"), true)
})

test("recusa substituição ambígua ou inexistente", () => {
  const originais = [{ caminho: "src/pages/Clientes.jsx", conteudo: "Cliente\nCliente\n" }]
  assert.throws(() => validarAlteracoes({ arquivos: [{ caminho: "src/pages/Clientes.jsx", operacoes: [{ buscar: "Cliente", substituir: "Empresa" }] }] }, originais, "web"), /forma única/)
})

test("recusa arquivo novo, credencial e alteração extensa", () => {
  const originais = [{ caminho: "src/services/testeService.js", conteudo: "module.exports = false\n" }]
  assert.throws(() => validarAlteracoes({ arquivos: [{ caminho: "src/services/novo.js", conteudo: "novo" }] }, originais, "api"), /Nenhuma mudança segura/)
  assert.throws(() => validarAlteracoes({ arquivos: [{ caminho: "src/services/testeService.js", conteudo: "const token = process.env.API_SECRET\n" }] }, originais, "api"), /credenciais/)
  assert.throws(() => validarAlteracoes({ arquivos: [{ caminho: "src/services/testeService.js", conteudo: "x".repeat(130000) }] }, originais, "api"), /grande demais/)
})

test("reconhece consulta e análise dos repositórios", () => {
  assert.equal(pedidoAcessoArquivos("Você consegue acessar os arquivos da API e Web?"), true)
  assert.equal(pedidoAnalisarCodigo("Analise o layout da tela de clientes"), true)
  assert.equal(pedidoAnalisarCodigo("Não analise os arquivos da Web"), false)
  assert.deepEqual(repositoriosNaMensagem("verifique a API e a Web"), ["api", "web"])
  assert.deepEqual(repositoriosNaMensagem("analise o layout da tela"), ["web"])
  assert.equal(pedidoValidarPublicacao("Valide a publicação do plano #12"), true)
  assert.equal(pedidoConversaTecnica("O que falta para terminar o Modo Desenvolvedor?"), true)
  assert.equal(pedidoConversaTecnica("Qual é o CPF do cliente?"), false)
})

test("seleciona arquivos relacionados sem incluir dependências ou artefatos", () => {
  const arquivos = [
    "src/pages/Clientes.jsx",
    "src/components/ClienteCard.jsx",
    "src/pages/Financeiro.jsx",
    "src/pages/ConversaNexa.jsx",
    "dist/assets/index.js",
    "node_modules/react/index.js",
    "src/assets/logo.png",
  ]
  const selecionados = selecionarArquivosParaAnalise(arquivos, "analise o layout de clientes", "web")
  assert.equal(selecionados[0], "src/pages/Clientes.jsx")
  assert.equal(selecionados.includes("dist/assets/index.js"), false)
  assert.equal(selecionados.includes("node_modules/react/index.js"), false)
  assert.equal(selecionados.includes("src/assets/logo.png"), false)
  assert.equal(selecionados.includes("src/pages/ConversaNexa.jsx"), false)
})

const API = "https://api.github.com"

function configuracaoGitHub() {
  return {
    token: String(process.env.NEXA_GITHUB_TOKEN || "").trim(),
    owner: String(process.env.NEXA_GITHUB_OWNER || "").trim(),
    repos: {
      web: String(process.env.NEXA_GITHUB_WEB_REPO || "").trim(),
      api: String(process.env.NEXA_GITHUB_API_REPO || "").trim(),
    },
    branch: String(process.env.NEXA_GITHUB_PRODUCTION_BRANCH || "main").trim(),
  }
}

function configurado() {
  const cfg = configuracaoGitHub()
  return Boolean(cfg.token && cfg.owner && cfg.repos.web && cfg.repos.api && cfg.branch)
}

async function github(caminho, opcoes = {}) {
  const cfg = configuracaoGitHub()
  if (!configurado()) throw new Error("A conexão com o GitHub ainda não está configurada")
  const resposta = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Nexa-Developer",
      ...(opcoes.headers || {}),
    },
  })
  const texto = await resposta.text()
  let dados = null
  try { dados = texto ? JSON.parse(texto) : null } catch (_error) { dados = texto }
  if (!resposta.ok) {
    const erro = new Error(dados?.message || `GitHub respondeu ${resposta.status}`)
    erro.status = resposta.status
    throw erro
  }
  return dados
}

function repoDoTipo(tipo) {
  const repo = configuracaoGitHub().repos[tipo]
  if (!repo) throw new Error("Repositório não configurado")
  return repo
}

function rotaRepo(tipo, sufixo = "") {
  const cfg = configuracaoGitHub()
  return `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(repoDoTipo(tipo))}${sufixo}`
}

async function verificarConexao() {
  if (!configurado()) return { conectado: false, motivo: "Variáveis do GitHub incompletas." }
  const cfg = configuracaoGitHub()
  const resultados = {}
  for (const tipo of ["api", "web"]) {
    const repo = await github(rotaRepo(tipo))
    resultados[tipo] = { nome: repo.full_name, privado: Boolean(repo.private), branchPadrao: repo.default_branch }
  }
  return { conectado: true, owner: cfg.owner, branchProducao: cfg.branch, repositorios: resultados }
}

async function referencia(tipo, branch = configuracaoGitHub().branch) {
  return github(rotaRepo(tipo, `/git/ref/heads/${encodeURIComponent(branch)}`))
}

async function listarArvore(tipo, branch = configuracaoGitHub().branch) {
  const ref = await referencia(tipo, branch)
  const commit = await github(rotaRepo(tipo, `/git/commits/${ref.object.sha}`))
  const arvore = await github(rotaRepo(tipo, `/git/trees/${commit.tree.sha}?recursive=1`))
  return { sha: ref.object.sha, arquivos: (arvore.tree || []).filter((item) => item.type === "blob").map((item) => item.path) }
}

async function lerArquivo(tipo, caminho, branch = configuracaoGitHub().branch) {
  const dados = await github(rotaRepo(tipo, `/contents/${caminho.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`))
  if (!dados?.content || dados.encoding !== "base64") throw new Error(`Não foi possível ler ${caminho}`)
  return { caminho, sha: dados.sha, conteudo: Buffer.from(dados.content, "base64").toString("utf8") }
}

async function criarBranch(tipo, nome, shaBase) {
  return github(rotaRepo(tipo, "/git/refs"), { method: "POST", body: JSON.stringify({ ref: `refs/heads/${nome}`, sha: shaBase }) })
}

async function criarCommit(tipo, { branch, shaBase, arquivos, mensagem }) {
  const base = await github(rotaRepo(tipo, `/git/commits/${shaBase}`))
  const itens = []
  for (const arquivo of arquivos) {
    const blob = await github(rotaRepo(tipo, "/git/blobs"), {
      method: "POST",
      body: JSON.stringify({ content: arquivo.conteudo, encoding: "utf-8" }),
    })
    itens.push({ path: arquivo.caminho, mode: "100644", type: "blob", sha: blob.sha })
  }
  const tree = await github(rotaRepo(tipo, "/git/trees"), { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree: itens }) })
  const commit = await github(rotaRepo(tipo, "/git/commits"), {
    method: "POST",
    body: JSON.stringify({ message: mensagem, tree: tree.sha, parents: [shaBase] }),
  })
  await github(rotaRepo(tipo, `/git/refs/heads/${encodeURIComponent(branch)}`), { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) })
  return commit
}

async function criarPullRequest(tipo, { branch, titulo, descricao }) {
  const cfg = configuracaoGitHub()
  return github(rotaRepo(tipo, "/pulls"), {
    method: "POST",
    body: JSON.stringify({ title: titulo, head: branch, base: cfg.branch, body: descricao, draft: false }),
  })
}

async function execucoesDaBranch(tipo, branch) {
  const dados = await github(rotaRepo(tipo, `/actions/runs?branch=${encodeURIComponent(branch)}&per_page=20`))
  return dados.workflow_runs || []
}

async function obterPullRequest(tipo, numero) {
  return github(rotaRepo(tipo, `/pulls/${Number(numero)}`))
}

async function publicarPullRequest(tipo, numero, mensagem) {
  return github(rotaRepo(tipo, `/pulls/${Number(numero)}/merge`), {
    method: "PUT",
    body: JSON.stringify({ commit_title: mensagem, merge_method: "squash" }),
  })
}

module.exports = {
  configuracaoGitHub,
  configurado,
  verificarConexao,
  listarArvore,
  lerArquivo,
  criarBranch,
  criarCommit,
  criarPullRequest,
  execucoesDaBranch,
  obterPullRequest,
  publicarPullRequest,
}

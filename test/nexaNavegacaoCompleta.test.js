const test = require("node:test")
const assert = require("node:assert/strict")

const { _test } = require("../src/controllers/conversaController")
const Cliente = require("../src/models/Cliente")

const paginasAdministrador = [
  ["Abra funcionários", "Funcionários"],
  ["Abra a folha de pagamento", "Folha de Pagamento"],
  ["Abra o pró-labore", "Pró-labore"],
  ["Abra férias", "Férias"],
  ["Abra a calculadora de rescisão", "Calculadora de Rescisão"],
  ["Abra a conciliação bancária", "Conciliação Bancária"],
  ["Abra NF-e", "NF-e"],
  ["Abrir nota fiscal", "NF-e"],
  ["Abra NF", "NF-e"],
  ["Abra NFS-e", "NFS-e"],
  ["Abra o Google Drive", "Google Drive"],
  ["Abra Escritórios Nexa", "Escritórios Nexa"],
]

for (const [mensagem, pagina] of paginasAdministrador) {
  test(`navega deterministicamente para ${pagina}`, async () => {
    const resposta = await _test.detectarComandoNavegacaoDeterministico({
      mensagem,
      usuario: { perfil: "Administrador" },
      origem: "voz",
    })

    assert.equal(resposta?.acao?.tipo, "navegar")
    assert.equal(resposta?.acao?.pagina, pagina)
    assert.equal(resposta?.acao?.segura, true)
  })
}

test("funcionário não pode abrir Escritórios Nexa", async () => {
  const resposta = await _test.detectarComandoNavegacaoDeterministico({
    mensagem: "Abra Escritórios Nexa",
    usuario: { perfil: "Funcionário" },
    origem: "voz",
  })

  assert.equal(resposta?.acao, null)
  assert.match(resposta?.resposta || "", /não possui permissão/i)
})

test("administrador abre o Cofre usando o cliente citado", async (t) => {
  t.mock.method(Cliente, "findAll", async () => [
    { id: 17, nome: "Jarede", regime: "MEI", situacaoEmpresa: "Ativa" },
  ])

  const resposta = await _test.detectarComandoNavegacaoDeterministico({
    mensagem: "abra o cofre da cliente Jarede",
    usuario: { perfil: "Administrador" },
    origem: "texto",
  })

  assert.equal(resposta?.acao?.tipo, "navegar")
  assert.equal(resposta?.acao?.pagina, "Central e-CAC")
  assert.equal(resposta?.acao?.alvo, "cofre-cliente")
  assert.equal(resposta?.acao?.cliente?.id, 17)
  assert.match(resposta?.resposta || "", /Cofre.*Jarede/i)
})

test("administrador resolve 'cofre dela' pelo histórico recente", async (t) => {
  t.mock.method(Cliente, "findAll", async () => [
    { id: 17, nome: "Jarede", regime: "MEI", situacaoEmpresa: "Ativa" },
  ])

  const resposta = await _test.detectarComandoNavegacaoDeterministico({
    mensagem: "abra o cofre dela então",
    historico: [{ autor: "Você", texto: "Preciso da senha gov.br da cliente Jarede" }],
    usuario: { perfil: "Administrador" },
    origem: "texto",
  })

  assert.equal(resposta?.acao?.pagina, "Central e-CAC")
  assert.equal(resposta?.acao?.cliente?.id, 17)
})

test("Cofre continua bloqueado para perfil não administrador", async (t) => {
  t.mock.method(Cliente, "findAll", async () => [
    { id: 17, nome: "Jarede", regime: "MEI", situacaoEmpresa: "Ativa" },
  ])

  const resposta = await _test.detectarComandoNavegacaoDeterministico({
    mensagem: "abra o cofre da cliente Jarede",
    usuario: { perfil: "Funcionário" },
    origem: "texto",
  })

  assert.equal(resposta?.acao, null)
  assert.match(resposta?.resposta || "", /somente.*Administrador/i)
})

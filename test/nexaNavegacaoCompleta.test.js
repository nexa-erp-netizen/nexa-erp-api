const test = require("node:test")
const assert = require("node:assert/strict")

const { _test } = require("../src/controllers/conversaController")

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

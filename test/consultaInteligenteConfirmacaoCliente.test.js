const test = require("node:test")
const assert = require("node:assert/strict")

const Cliente = require("../src/models/Cliente")
const {
  detectarConsultaInteligente,
  responderConfirmacaoCliente,
  campoCadastroSolicitado,
} = require("../src/services/consultaInteligenteService")

const hamilton = {
  id: 17,
  nome: "Hamilton Michael dos Santos",
  cpf: "123.456.789-00",
  telefone: "(41) 99999-0000",
  endereco: "Rua das Flores",
  numero: "10",
  bairro: "Centro",
  cidade: "Curitiba",
  estado: "PR",
}

function comClientes(clientes, executar) {
  const original = Cliente.findAll
  Cliente.findAll = async () => clientes
  return Promise.resolve()
    .then(executar)
    .finally(() => {
      Cliente.findAll = original
    })
}

test("identifica dados cadastrais comuns", () => {
  assert.equal(campoCadastroSolicitado("preciso do cpf"), "cpf")
  assert.equal(campoCadastroSolicitado("qual o telefone dele"), "telefone")
  assert.equal(campoCadastroSolicitado("me passe o endereço"), "endereco")
})

test("nome parcial pede confirmação antes de informar CPF", async () => {
  await comClientes([hamilton], async () => {
    const resultado = await detectarConsultaInteligente({
      mensagem: "Preciso do CPF do cliente Hamilton",
      clienteId: null,
      usuario: { perfil: "Administrador" },
    })

    assert.equal(resultado.resposta, "Seria Hamilton Michael dos Santos?")
    assert.equal(resultado.confirmacaoClientePendente.clienteId, 17)
    assert.equal(resultado.confirmacaoClientePendente.campo, "cpf")
  })
})

test("sim retoma o pedido original e informa o CPF", async () => {
  await comClientes([hamilton], async () => {
    const resultado = await responderConfirmacaoCliente({
      confirmacao: {
        clienteId: 17,
        clienteNome: hamilton.nome,
        campo: "cpf",
        pedidoOriginal: "Preciso do CPF do cliente Hamilton",
      },
      mensagem: "Sim",
      usuario: { perfil: "Administrador" },
    })

    assert.match(resultado.resposta, /123\.456\.789-00/)
    assert.equal(resultado.confirmacaoClienteConcluida, true)
    assert.equal(resultado.clienteIdConfirmado, 17)
  })
})

test("não cancela a confirmação e pede identificação melhor", async () => {
  const resultado = await responderConfirmacaoCliente({
    confirmacao: { clienteId: 17, campo: "cpf", pedidoOriginal: "CPF do Hamilton" },
    mensagem: "Não",
    usuario: { perfil: "Administrador" },
  })

  assert.equal(resultado.confirmacaoClienteCancelada, true)
  assert.match(resultado.resposta, /nome completo ou o código/i)
})

test("nome completo informa o dado diretamente", async () => {
  await comClientes([hamilton], async () => {
    const resultado = await detectarConsultaInteligente({
      mensagem: "Qual o telefone de Hamilton Michael dos Santos?",
      clienteId: null,
      usuario: { perfil: "Administrador" },
    })

    assert.match(resultado.resposta, /99999-0000/)
    assert.equal(resultado.confirmacaoClientePendente, undefined)
  })
})

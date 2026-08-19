const test = require("node:test")
const assert = require("node:assert/strict")

const {
  validarCampo,
  cpfValido,
  intencaoNovoCliente,
  intencaoAtualizarCliente,
  campoNaMensagem,
} = require("../src/services/nexaActionsService")

test("reconhece pedido de novo cadastro", () => {
  assert.equal(intencaoNovoCliente("Nexa, cadastre um novo cliente"), true)
  assert.equal(intencaoNovoCliente("Qual é o telefone do cliente?"), false)
})

test("reconhece atualização cadastral e o campo", () => {
  assert.equal(intencaoAtualizarCliente("Altere o telefone do cliente para 41999998888"), true)
  assert.equal(campoNaMensagem("Atualize o e-mail da empresa"), "email")
  assert.equal(campoNaMensagem("Mude a inscrição municipal"), "inscricaoMunicipal")
})

test("valida CPF e bloqueia sequências inválidas", () => {
  assert.equal(cpfValido("529.982.247-25"), true)
  assert.equal(cpfValido("111.111.111-11"), false)
  assert.equal(validarCampo("cpf", "529.982.247-25").valor, "52998224725")
})

test("valida telefone, e-mail, CEP, UF e data", () => {
  assert.equal(validarCampo("telefone", "(41) 99999-8888").valor, "41999998888")
  assert.equal(validarCampo("email", "cliente@nexa.com.br").valor, "cliente@nexa.com.br")
  assert.equal(validarCampo("cep", "83.400-000").valor, "83400000")
  assert.equal(validarCampo("estado", "pr").valor, "PR")
  assert.equal(validarCampo("dataNascimento", "27/05/1997").valor, "1997-05-27")
})

test("rejeita dados cadastrais inválidos", () => {
  assert.match(validarCampo("telefone", "123").erro, /telefone/i)
  assert.match(validarCampo("email", "email-invalido").erro, /e-mail/i)
  assert.match(validarCampo("cep", "1234").erro, /8 números/i)
})

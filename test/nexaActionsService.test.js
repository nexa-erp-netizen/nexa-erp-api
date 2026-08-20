const test = require("node:test")
const assert = require("node:assert/strict")

const {
  processarNexaAction,
  validarCampo,
  cpfValido,
  cnpjValido,
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

test("valida CNPJ e os novos campos do cadastro completo", () => {
  assert.equal(cnpjValido("11.222.333/0001-81"), true)
  assert.equal(cnpjValido("11.111.111/1111-11"), false)
  assert.equal(validarCampo("ativo", "inativo").valor, false)
  assert.equal(validarCampo("situacaoEmpresa", "em constituição").valor, "Em Constituição")
  assert.equal(validarCampo("regime", "simples nacional").valor, "Simples Nacional")
  assert.equal(validarCampo("ramoAtividade", "serviços").valor, "Serviços")
  assert.equal(validarCampo("dataInicioAtividades", "19/08/2026").valor, "2026-08-19")
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

test("cadastro novo oferece concluir ou continuar após os cinco dados principais", async () => {
  let resposta = await processarNexaAction({ mensagem: "Cadastre um novo cliente", usuario: { perfil: "Administrador" } })
  for (const mensagem of ["Empresa Teste", "52998224725", "41999998888", "teste@nexa.com.br", "11222333000181"]) {
    resposta = await processarNexaAction({ mensagem, pendente: resposta.acaoGuiadaPendente, usuario: { perfil: "Administrador" } })
  }
  assert.equal(resposta.acaoGuiadaPendente.etapa, "escolha-complemento")
  assert.match(resposta.resposta, /concluir/i)
  assert.match(resposta.resposta, /continuar/i)

  const concluir = await processarNexaAction({ mensagem: "concluir", pendente: resposta.acaoGuiadaPendente, usuario: { perfil: "Administrador" } })
  assert.equal(concluir.acaoGuiadaPendente.etapa, "confirmacao")

  const continuar = await processarNexaAction({ mensagem: "continuar", pendente: resposta.acaoGuiadaPendente, usuario: { perfil: "Administrador" } })
  assert.equal(continuar.acaoGuiadaPendente.etapa, "coleta-complementar")
  assert.equal(continuar.acaoGuiadaPendente.proximoCampo, "ativo")
})

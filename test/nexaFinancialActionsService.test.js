const test = require("node:test")
const assert = require("node:assert/strict")

const {
  intencaoNovoMovimento,
  numeroMonetario,
  dataIso,
  tipoMovimento,
  extrairDadosIniciais,
  localizarCliente,
} = require("../src/services/nexaFinancialActionsService")

test("reconhece lançamento de receita ou despesa", () => {
  assert.equal(intencaoNovoMovimento("Nexa, lance uma despesa para a Multicópias"), true)
  assert.equal(intencaoNovoMovimento("Registre uma receita do cliente Daiane"), true)
  assert.equal(intencaoNovoMovimento("Mostre as despesas da Multicópias"), false)
})

test("não captura conta própria do financeiro do escritório", () => {
  assert.equal(intencaoNovoMovimento("Lance uma conta a pagar no financeiro do escritório"), false)
})

test("converte valores brasileiros com segurança", () => {
  assert.equal(numeroMonetario("R$ 1.234,56"), 1234.56)
  assert.equal(numeroMonetario("87,05"), 87.05)
  assert.equal(numeroMonetario("zero"), null)
})

test("entende tipo e data do movimento", () => {
  assert.equal(tipoMovimento("crédito"), "Receita")
  assert.equal(tipoMovimento("saída"), "Despesa")
  assert.equal(dataIso("20/08/2026"), "2026-08-20")
})

test("extrai dados fornecidos em um comando natural", () => {
  const dados = extrairDadosIniciais("Lance uma despesa de gasolina no valor de R$ 150,90 em 20/08/2026 via PIX")
  assert.equal(dados.tipo, "Despesa")
  assert.equal(dados.descricao, "gasolina")
  assert.equal(dados.valor, 150.9)
  assert.equal(dados.data, "2026-08-20")
  assert.equal(dados.formaPagamento.toLowerCase(), "pix")
})

test("localiza cliente pelo nome parcial dentro do comando", () => {
  const clientes = [
    { id: 1, nome: "Multicópias Maracanã" },
    { id: 2, nome: "Daiane Dallazen Vitor" },
  ]
  const resultado = localizarCliente(clientes, "Lance uma despesa para a Multicópias, hoje, via PIX")
  assert.equal(resultado.cliente.id, 1)
})

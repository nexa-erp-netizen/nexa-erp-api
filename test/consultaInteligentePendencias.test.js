const test = require("node:test")
const assert = require("node:assert/strict")

const {
  financeiroAbertoParaPrioridade,
  movimentoContabilAberto,
} = require("../src/services/pendenciaFiltersService")

test("mantém honorário realmente pendente", () => {
  assert.equal(financeiroAbertoParaPrioridade({
    descricao: "Honorários contábeis julho",
    tipo: "Receber",
    origem: "Honorários",
    status: "Pendente",
  }), true)
})

test("exclui receita bruta mensal das pendências", () => {
  assert.equal(financeiroAbertoParaPrioridade({
    descricao: "Receita bruta mensal",
    tipo: "Receita",
    origem: "Movimento Cliente",
    status: "Pendente",
  }), false)
})

test("exclui financeiro recebido ou confirmado", () => {
  assert.equal(financeiroAbertoParaPrioridade({
    descricao: "Honorários contábeis",
    tipo: "Receber",
    status: "Recebido",
  }), false)
  assert.equal(financeiroAbertoParaPrioridade({
    descricao: "Pagamento confirmado - DAS",
    tipo: "Receber",
    status: "Pendente",
  }), false)
})

test("não considera status vazio como pendência financeira", () => {
  assert.equal(financeiroAbertoParaPrioridade({
    descricao: "Registro histórico",
    tipo: "Receita",
    status: "",
  }), false)
})

test("mantém movimento manual aguardando conferência", () => {
  assert.equal(movimentoContabilAberto({
    descricao: "Nota fiscal enviada pelo cliente",
    status: "Pendente",
    observacao: "Aguardando conferência",
  }), true)
})

test("exclui receita bruta mensal dos movimentos pendentes", () => {
  assert.equal(movimentoContabilAberto({
    descricao: "Receita bruta mensal",
    status: "Pendente",
  }), false)
})

test("exclui pagamento confirmado criado automaticamente", () => {
  assert.equal(movimentoContabilAberto({
    descricao: "Pagamento confirmado - DAS",
    status: "Pendente",
    forma: "Confirmado pelo cliente",
    observacao: "fiscal:42",
  }), false)
})

test("exclui movimentos já conferidos ou recebidos", () => {
  assert.equal(movimentoContabilAberto({
    descricao: "Nota fiscal",
    status: "Conferido",
  }), false)
  assert.equal(movimentoContabilAberto({
    descricao: "Honorário",
    status: "Recebido",
  }), false)
})

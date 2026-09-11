const test = require("node:test")
const assert = require("node:assert/strict")
const { detectarPedidoRelatorio } = require("../src/services/nexaFerramentasService")

test("não gera relatório ao perguntar se a Nexa lê PDF", () => {
  assert.equal(detectarPedidoRelatorio("se te mandar um arquivo em pdf vc consegue ler?"), null)
  assert.equal(detectarPedidoRelatorio("você aceita PDF?"), null)
  assert.equal(detectarPedidoRelatorio("posso enviar um PDF para você analisar?"), null)
  assert.equal(detectarPedidoRelatorio("você consegue gerar um relatório em PDF?"), null)
  assert.equal(detectarPedidoRelatorio("tem como exportar isso para Excel?"), null)
})

test("mantém pedidos explícitos de geração de relatório", () => {
  assert.deepEqual(detectarPedidoRelatorio("gere um relatório financeiro em PDF"), { tipo: "financeiro", formato: "pdf" })
  assert.deepEqual(detectarPedidoRelatorio("quero uma planilha Excel dos clientes"), { tipo: "clientes", formato: "xls" })
  assert.deepEqual(detectarPedidoRelatorio("exporte o relatório fiscal para PDF"), { tipo: "fiscal", formato: "pdf" })
})

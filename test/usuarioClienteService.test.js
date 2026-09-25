const test = require("node:test")
const assert = require("node:assert/strict")

const {
  idsUnicos,
  escolherClienteAtivo,
} = require("../src/services/usuarioClienteService")
const Fiscal = require("../src/models/Fiscal")
const SolicitacaoCliente = require("../src/models/SolicitacaoCliente")
const DocumentoDigital = require("../src/models/DocumentoDigital")
const Declaracao = require("../src/models/Declaracao")

test("normaliza os IDs das empresas sem duplicar vínculos", () => {
  assert.deepEqual(idsUnicos(["2", 2, 0, null, "abc", 5]), [2, 5])
})

test("mantém a empresa solicitada quando ela pertence ao login", () => {
  const clientes = [
    { id: 10, nome: "CNPJ antigo", principal: true, portalBloqueado: false },
    { id: 20, nome: "CNPJ novo", principal: false, portalBloqueado: false },
  ]
  assert.equal(escolherClienteAtivo(clientes, 20).id, 20)
})

test("não permite selecionar uma empresa fora dos vínculos", () => {
  const clientes = [
    { id: 10, nome: "CNPJ autorizado", principal: true, portalBloqueado: false },
  ]
  assert.equal(escolherClienteAtivo(clientes, 999).id, 10)
})

test("no login prioriza empresa desbloqueada mesmo se a principal estiver bloqueada", () => {
  const clientes = [
    { id: 10, nome: "Empresa bloqueada", principal: true, portalBloqueado: true },
    { id: 20, nome: "Empresa disponível", principal: false, portalBloqueado: false },
  ]
  assert.equal(escolherClienteAtivo(clientes).id, 20)
})

test("uma empresa baixada continua selecionável para histórico e parcelamentos", () => {
  const clientes = [
    { id: 10, nome: "Empresa baixada", situacaoEmpresa: "Baixada", principal: true, portalBloqueado: false },
  ]
  assert.equal(escolherClienteAtivo(clientes).situacaoEmpresa, "Baixada")
})

test("módulos do Portal possuem vínculo por clienteId para separar CNPJs com o mesmo nome", () => {
  for (const modelo of [Fiscal, SolicitacaoCliente, DocumentoDigital, Declaracao]) {
    assert.ok(modelo.rawAttributes.clienteId, `${modelo.name} precisa de clienteId`)
  }
})

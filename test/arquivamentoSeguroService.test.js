const test = require("node:test")
const assert = require("node:assert/strict")
const { validarArquivamentoUsuario, validarArquivamentoEscritorio, confirmacaoNomeValida } = require("../src/services/arquivamentoSeguroService")

test("impede excluir o próprio usuário e o administrador da plataforma", () => {
  assert.equal(validarArquivamentoUsuario({ id: 7, plataformaAdmin: false }, { id: 7 }).permitido, false)
  assert.equal(validarArquivamentoUsuario({ id: 8, plataformaAdmin: true }, { id: 7 }).permitido, false)
  assert.equal(validarArquivamentoUsuario({ id: 8, plataformaAdmin: false }, { id: 7 }).permitido, true)
})

test("impede excluir o escritório principal", () => {
  assert.equal(validarArquivamentoEscritorio({ id: 3 }, { escritorioId: 3 }, false).permitido, false)
  assert.equal(validarArquivamentoEscritorio({ id: 4 }, { escritorioId: 3 }, true).permitido, false)
  assert.equal(validarArquivamentoEscritorio({ id: 4 }, { escritorioId: 3 }, false).permitido, true)
})

test("confirmação exige exatamente o nome do escritório", () => {
  assert.equal(confirmacaoNomeValida("Empresa Teste", "Empresa Teste"), true)
  assert.equal(confirmacaoNomeValida("Empresa Teste", "empresa teste"), false)
})

const test = require("node:test")
const assert = require("node:assert/strict")

const { classificarMensagemOperacional } = require("../src/services/nexaRouterService")

const consultas = [
  ["Preciso do CPF do cliente Hamilton", "cliente"],
  ["Qual o telefone de Hamilton Michael dos Santos?", "cliente"],
  ["Quais são as anotações do cliente Teste?", "cliente"],
  ["Quais são as prioridades de hoje?", "prioridades-hoje"],
  ["Iniciar meu dia", "prioridades-hoje"],
  ["Mostre todas as pendências.", "pendencias-gerais"],
  ["Quem está devendo honorários?", "financeiro"],
  ["Quais pagamentos foram recebidos hoje?", "pagamentos-hoje"],
  ["O que foi concluído hoje?", "resolvidas-hoje"],
  ["Quais documentos os clientes enviaram?", "documentos-pendentes"],
  ["Tem alguma mensagem de cliente?", "mensagens-pendentes"],
]

for (const [mensagem, intencao] of consultas) {
  test(`classifica sem IA: ${mensagem}`, () => {
    assert.deepEqual(classificarMensagemOperacional(mensagem), {
      tipo: "consulta",
      intencao,
      deterministica: true,
      usaIa: false,
    })
  })
}

const navegacoes = [
  "Abra o Fiscal.",
  "Volte ao Dashboard.",
  "Abra o Matheus.",
  "Abra o cliente CLI-0001.",
  "Abra o Matheus e entre em Serviços e Cobranças.",
  "Abra o histórico e as anotações do cliente Teste.",
]

for (const mensagem of navegacoes) {
  test(`reconhece navegação sem IA: ${mensagem}`, () => {
    const resultado = classificarMensagemOperacional(mensagem)
    assert.equal(resultado?.tipo, "navegacao")
    assert.equal(resultado?.usaIa, false)
  })
}

test("não captura conversa geral", () => {
  assert.equal(classificarMensagemOperacional("Por que contador não pode ser MEI?"), null)
  assert.equal(classificarMensagemOperacional("Qual a sua opinião sobre isso?"), null)
  assert.equal(classificarMensagemOperacional("Escreva uma mensagem de aniversário para minha esposa."), null)
  assert.equal(classificarMensagemOperacional("Explique como funciona um avião."), null)
  assert.equal(classificarMensagemOperacional("Monte um plano de estudos para inglês."), null)
})

test("documento enviado ao cliente não é classificado como documento pendente", () => {
  assert.equal(classificarMensagemOperacional("Quais documentos foram enviados ao cliente?"), null)
})

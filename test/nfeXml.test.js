const test = require("node:test")
const assert = require("node:assert/strict")
const forge = require("node-forge")
const { montarNFe, assinarNFe } = require("../src/services/nfeSefazService")

test("monta chave de 44 dígitos e assina infNFe", () => {
  const nota = { numero: 1, serie: 1, naturezaOperacao: "Venda", destinatario: { cpfCnpj: "12345678909", cep: "83400000", endereco: "Rua Teste", numero: "1", bairro: "Centro", cidade: "Colombo", estado: "PR", codigoMunicipio: "4105805" }, itens: [{ codigo: "T1", descricao: "PRODUTO TESTE", ncm: "90031100", cfop: "5102", unidade: "UN", quantidade: 1, valorUnitario: 100, valorTotal: 100, origem: "0", csosn: "102" }], valorProdutos: 100, valorFrete: 0, valorDesconto: 0, valorTotal: 100 }
  const emitente = { cnpj: "53534729000104", nome: "OPTICA TESTE", endereco: "Rua Teste", numero: "1", bairro: "Centro", cidade: "Colombo", estado: "PR", cep: "83400000", inscricaoEstadual: "9104978808" }
  const configuracao = { ambiente: "homologacao", crt: "1", codigoMunicipio: "4105805" }
  const montada = montarNFe({ nota, emitente, configuracao })
  assert.match(montada.chave, /^\d{44}$/)
  assert.match(montada.xml, /NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO/)
  const pares = forge.pki.rsa.generateKeyPair(1024)
  const certificado = forge.pki.createCertificate(); certificado.publicKey = pares.publicKey; certificado.serialNumber = "01"; certificado.validity.notBefore = new Date(); certificado.validity.notAfter = new Date(Date.now() + 86400000); certificado.setSubject([{ name: "commonName", value: "Teste" }]); certificado.setIssuer([{ name: "commonName", value: "Teste" }]); certificado.sign(pares.privateKey, forge.md.sha256.create())
  const assinado = assinarNFe(montada.xml, forge.pki.privateKeyToPem(pares.privateKey), forge.pki.certificateToPem(certificado))
  assert.match(assinado, /<Signature/)
  assert.match(assinado, new RegExp(`URI="#NFe${montada.chave}"`))
})

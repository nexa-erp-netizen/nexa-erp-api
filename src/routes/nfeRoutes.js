const express = require("express")
const { Op } = require("sequelize")
const Cliente = require("../models/Cliente")
const CertificadoDigital = require("../models/CertificadoDigital")
const NFeConfiguracao = require("../models/NFeConfiguracao")
const ProdutoNFe = require("../models/ProdutoNFe")
const NFe = require("../models/NFe")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()
router.use(autenticar)
router.use((req, res, next) => ["Administrador", "Funcionário"].includes(req.usuario.perfil) ? next() : res.status(403).json({ message: "Acesso negado" }))

const texto = (valor) => String(valor || "").trim()
const numero = (valor) => Number(valor || 0)

function dadosProduto(body) {
  return {
    clienteId: Number(body.clienteId), codigo: texto(body.codigo), descricao: texto(body.descricao),
    ncm: texto(body.ncm).replace(/\D/g, ""), cest: texto(body.cest).replace(/\D/g, "") || null,
    cfop: texto(body.cfop).replace(/\D/g, ""), unidade: texto(body.unidade).toUpperCase() || "UN",
    valorUnitario: numero(body.valorUnitario), origem: texto(body.origem) || "0", csosn: texto(body.csosn) || null,
    cstIcms: texto(body.cstIcms) || null, cstPis: texto(body.cstPis) || null,
    cstCofins: texto(body.cstCofins) || null, ativo: body.ativo !== false,
  }
}

function validarProduto(dados) {
  const erros = []
  if (!dados.clienteId) erros.push("Selecione o emitente.")
  if (!dados.codigo) erros.push("Informe o código do produto.")
  if (!dados.descricao) erros.push("Informe a descrição do produto.")
  if (dados.ncm.length !== 8) erros.push("O NCM deve ter 8 dígitos.")
  if (dados.cfop.length !== 4) erros.push("O CFOP deve ter 4 dígitos.")
  if (dados.valorUnitario < 0) erros.push("O valor unitário não pode ser negativo.")
  return erros
}

function prepararNota(body) {
  const itens = Array.isArray(body.itens) ? body.itens.map((item) => ({
    produtoId: item.produtoId ? Number(item.produtoId) : null,
    codigo: texto(item.codigo), descricao: texto(item.descricao), ncm: texto(item.ncm), cfop: texto(item.cfop),
    unidade: texto(item.unidade) || "UN", quantidade: numero(item.quantidade), valorUnitario: numero(item.valorUnitario),
    valorTotal: Number((numero(item.quantidade) * numero(item.valorUnitario)).toFixed(2)),
    origem: texto(item.origem) || "0", csosn: texto(item.csosn) || null,
  })) : []
  const valorProdutos = itens.reduce((total, item) => total + item.valorTotal, 0)
  const valorFrete = numero(body.valorFrete)
  const valorDesconto = numero(body.valorDesconto)
  return {
    clienteId: Number(body.clienteId), serie: Number(body.serie || 1), ambiente: "homologacao", status: "rascunho",
    naturezaOperacao: texto(body.naturezaOperacao) || "Venda de mercadoria", destinatario: body.destinatario || {}, itens,
    valorProdutos: valorProdutos.toFixed(2), valorFrete: valorFrete.toFixed(2), valorDesconto: valorDesconto.toFixed(2),
    valorTotal: Math.max(0, valorProdutos + valorFrete - valorDesconto).toFixed(2),
  }
}

router.get("/configuracoes/:clienteId", async (req, res) => {
  const [configuracao] = await NFeConfiguracao.findOrCreate({ where: { clienteId: Number(req.params.clienteId) }, defaults: { clienteId: Number(req.params.clienteId) } })
  res.json(configuracao)
})

router.put("/configuracoes/:clienteId", async (req, res) => {
  const clienteId = Number(req.params.clienteId)
  const [configuracao] = await NFeConfiguracao.findOrCreate({ where: { clienteId }, defaults: { clienteId } })
  await configuracao.update({
    ambiente: "homologacao", serie: Math.max(1, Number(req.body.serie || 1)), proximoNumero: Math.max(1, Number(req.body.proximoNumero || 1)),
    crt: texto(req.body.crt) || null, naturezaOperacao: texto(req.body.naturezaOperacao) || "Venda de mercadoria",
    certificadoDigitalId: req.body.certificadoDigitalId ? Number(req.body.certificadoDigitalId) : null,
    provedor: null, ativo: false,
  })
  res.json(configuracao)
})

router.get("/diagnostico/:clienteId", async (req, res) => {
  const clienteId = Number(req.params.clienteId)
  const [cliente, configuracao, produtos] = await Promise.all([
    Cliente.findByPk(clienteId), NFeConfiguracao.findOne({ where: { clienteId } }), ProdutoNFe.count({ where: { clienteId, ativo: true } }),
  ])
  if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })
  const pendencias = []
  if (!cliente.cnpj) pendencias.push("Informe o CNPJ do emitente.")
  if (!cliente.inscricaoEstadual) pendencias.push("Informe a inscrição estadual do emitente.")
  if (!cliente.cep || !cliente.endereco || !cliente.numero || !cliente.cidade || !cliente.estado) pendencias.push("Complete o endereço do emitente.")
  if (!configuracao?.crt) pendencias.push("Configure o CRT do emitente.")
  if (!configuracao?.certificadoDigitalId) pendencias.push("Selecione um certificado digital A1.")
  else {
    const certificado = await CertificadoDigital.findOne({ where: { id: configuracao.certificadoDigitalId, clienteId, ativo: true, dataValidade: { [Op.gte]: new Date() } } })
    if (!certificado) pendencias.push("O certificado selecionado está ausente, vencido ou pertence a outro cliente.")
  }
  if (!produtos) pendencias.push("Cadastre ao menos um produto fiscal.")
  pendencias.push("Escolha e configure um provedor fiscal homologado para liberar a transmissão.")
  res.json({ prontoParaRascunho: pendencias.length === 1, prontoParaEmitir: false, ambiente: "homologacao", pendencias })
})

router.get("/produtos", async (req, res) => {
  const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}
  res.json(await ProdutoNFe.findAll({ where, order: [["descricao", "ASC"]] }))
})
router.post("/produtos", async (req, res) => {
  const dados = dadosProduto(req.body); const erros = validarProduto(dados)
  if (erros.length) return res.status(400).json({ message: erros.join(" ") })
  try { res.status(201).json(await ProdutoNFe.create(dados)) } catch (error) { res.status(400).json({ message: error.name === "SequelizeUniqueConstraintError" ? "Já existe um produto com esse código para o emitente." : "Erro ao cadastrar produto." }) }
})
router.put("/produtos/:id", async (req, res) => {
  const produto = await ProdutoNFe.findByPk(req.params.id); if (!produto) return res.status(404).json({ message: "Produto não encontrado" })
  const dados = dadosProduto(req.body); const erros = validarProduto(dados); if (erros.length) return res.status(400).json({ message: erros.join(" ") })
  await produto.update(dados); res.json(produto)
})

router.get("/notas", async (req, res) => {
  const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}
  res.json(await NFe.findAll({ where, order: [["createdAt", "DESC"]] }))
})
router.post("/notas", async (req, res) => {
  const dados = prepararNota(req.body)
  if (!dados.clienteId || !texto(dados.destinatario?.nome) || !texto(dados.destinatario?.cpfCnpj) || !dados.itens.length) return res.status(400).json({ message: "Emitente, destinatário, CPF/CNPJ e ao menos um item são obrigatórios." })
  if (dados.itens.some((item) => item.quantidade <= 0 || item.valorUnitario < 0)) return res.status(400).json({ message: "Revise quantidade e valor dos itens." })
  res.status(201).json(await NFe.create(dados))
})
router.put("/notas/:id", async (req, res) => {
  const nota = await NFe.findByPk(req.params.id); if (!nota) return res.status(404).json({ message: "NF-e não encontrada" })
  if (nota.status !== "rascunho") return res.status(409).json({ message: "Somente rascunhos podem ser alterados." })
  await nota.update(prepararNota(req.body)); res.json(nota)
})
router.post("/notas/:id/transmitir", async (_req, res) => res.status(409).json({ message: "Transmissão bloqueada nesta etapa. Configure primeiro um provedor fiscal homologado." }))

module.exports = router

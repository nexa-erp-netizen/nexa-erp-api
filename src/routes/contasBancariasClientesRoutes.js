const express = require("express")
const { Op } = require("sequelize")
const Cliente = require("../models/Cliente")
const ContaBancariaCliente = require("../models/ContaBancariaCliente")

const router = express.Router()

router.use((req, res, next) =>
  req.usuario.perfil === "Cliente"
    ? res.status(403).json({ message: "Acesso restrito ao escritório" })
    : next()
)

router.get("/", async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.ativo === "true") where.ativo = true
    if (req.query.ativo === "false") where.ativo = false
    const contas = await ContaBancariaCliente.findAll({
      where,
      order: [["principal", "DESC"], ["bancoNome", "ASC"], ["agencia", "ASC"]],
    })
    res.json(contas)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao listar contas bancárias" })
  }
})

router.post("/", async (req, res) => {
  try {
    const validacao = await validar(req.body)
    if (validacao.erro) return res.status(validacao.status || 400).json({ message: validacao.erro })
    if (req.body.principal) await removerPrincipal(validacao.cliente.id)
    const conta = await ContaBancariaCliente.create(dados(req.body, validacao.cliente))
    res.status(201).json(conta)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao cadastrar conta bancária" })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const conta = await ContaBancariaCliente.findByPk(req.params.id)
    if (!conta) return res.status(404).json({ message: "Conta bancária não encontrada" })
    const validacao = await validar(req.body, conta.id)
    if (validacao.erro) return res.status(validacao.status || 400).json({ message: validacao.erro })
    if (req.body.principal) await removerPrincipal(validacao.cliente.id, conta.id)
    await conta.update(dados(req.body, validacao.cliente))
    res.json(conta)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao atualizar conta bancária" })
  }
})

router.patch("/:id/status", async (req, res) => {
  try {
    const conta = await ContaBancariaCliente.findByPk(req.params.id)
    if (!conta) return res.status(404).json({ message: "Conta bancária não encontrada" })
    await conta.update({ ativo: Boolean(req.body.ativo) })
    res.json(conta)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao alterar situação da conta" })
  }
})

async function validar(body, ignorarId = null) {
  const cliente = await Cliente.findByPk(Number(body.clienteId))
  if (!cliente) return { erro: "Selecione uma empresa válida." }
  if (!String(body.bancoNome || "").trim()) return { erro: "Informe o banco." }
  if (!String(body.agencia || "").trim()) return { erro: "Informe a agência." }
  if (!String(body.conta || "").trim()) return { erro: "Informe o número da conta." }

  const where = {
    clienteId: cliente.id,
    agencia: String(body.agencia).trim(),
    conta: String(body.conta).trim(),
    bancoNome: String(body.bancoNome).trim(),
  }
  if (ignorarId) where.id = { [Op.ne]: ignorarId }
  if (await ContaBancariaCliente.findOne({ where })) {
    return { erro: "Esta conta bancária já está cadastrada para a empresa.", status: 409 }
  }
  return { cliente }
}

async function removerPrincipal(clienteId, ignorarId = null) {
  const where = { clienteId, principal: true }
  if (ignorarId) where.id = { [Op.ne]: ignorarId }
  await ContaBancariaCliente.update({ principal: false }, { where })
}

function dados(body, cliente) {
  return {
    clienteId: cliente.id,
    cliente: cliente.nome,
    bancoCodigo: String(body.bancoCodigo || "").trim() || null,
    bancoNome: String(body.bancoNome || "").trim(),
    agencia: String(body.agencia || "").trim(),
    conta: String(body.conta || "").trim(),
    digito: String(body.digito || "").trim() || null,
    tipoConta: body.tipoConta || "Conta corrente",
    moeda: body.moeda || "BRL",
    saldoInicial: Number(body.saldoInicial || 0),
    dataSaldoInicial: body.dataSaldoInicial || null,
    principal: Boolean(body.principal),
    ativo: body.ativo !== false,
    observacoes: String(body.observacoes || "").trim() || null,
  }
}

module.exports = router

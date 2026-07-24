const express = require("express")

const sequelize = require("../config/database")
const Cliente = require("../models/Cliente")
const Financeiro = require("../models/Financeiro")
const ServicoAvulso = require("../models/ServicoAvulso")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

function somenteEquipe(req, res, next) {
  if (!["Administrador", "Funcionário"].includes(req.usuario?.perfil)) {
    return res.status(403).json({ message: "Acesso negado" })
  }

  next()
}

function numeroSeguro(valor) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : 0
  }

  if (valor === null || valor === undefined || valor === "") {
    return 0
  }

  let texto = String(valor)
    .replace("R$", "")
    .replace(/\s/g, "")
    .trim()

  if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".")
  } else {
    texto = texto.replace(/[^0-9.-]/g, "")
  }

  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function quantidadeSegura(valor) {
  const quantidade = Math.trunc(Number(valor))
  return Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1
}

function moedaBanco(valor) {
  return Math.max(0, numeroSeguro(valor)).toFixed(2)
}

function formatarMoeda(valor) {
  return numeroSeguro(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function referenciaFinanceiro(servicoId) {
  return `servico-avulso:${servicoId}`
}

function descricaoFinanceiro(servico) {
  const quantidade = quantidadeSegura(servico.quantidade)
  return quantidade > 1
    ? `${quantidade}x ${servico.descricao}`
    : servico.descricao
}

function textoHistorico(servico) {
  const quantidade = quantidadeSegura(servico.quantidade)
  const subtotal = quantidade * numeroSeguro(servico.valorUnitario)
  const desconto = numeroSeguro(servico.desconto)
  const partes = [
    `${quantidade}x ${servico.descricao}`,
    `valor cobrado: ${formatarMoeda(servico.valorTotal)}`,
    `status: ${servico.status}`,
  ]

  if (desconto > 0) {
    partes.splice(1, 0, `subtotal: ${formatarMoeda(subtotal)}`, `desconto: ${formatarMoeda(desconto)}`)
  }

  return `Serviço avulso realizado — ${partes.join(" • ")}.`
}

function dadosCalculados(body, atual = {}) {
  const quantidade = quantidadeSegura(
    body.quantidade !== undefined ? body.quantidade : atual.quantidade
  )
  const valorUnitario = Math.max(
    0,
    numeroSeguro(
      body.valorUnitario !== undefined ? body.valorUnitario : atual.valorUnitario
    )
  )
  const subtotal = quantidade * valorUnitario
  const descontoSolicitado = Math.max(
    0,
    numeroSeguro(body.desconto !== undefined ? body.desconto : atual.desconto)
  )
  const desconto = Math.min(descontoSolicitado, subtotal)
  const valorTotal = Math.max(0, subtotal - desconto)

  return {
    quantidade,
    valorUnitario: moedaBanco(valorUnitario),
    desconto: moedaBanco(desconto),
    valorTotal: moedaBanco(valorTotal),
  }
}

function whereEmpresa(req) {
  return req.usuario?.empresaId ? { empresaId: req.usuario.empresaId } : {}
}

async function obterClienteValido(clienteId, req, transaction) {
  return Cliente.findOne({
    where: { id: clienteId },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  })
}

async function removerHistorico(cliente, historicoId, transaction) {
  if (!cliente || !historicoId) return

  const anotacoes = Array.isArray(cliente.anotacoes) ? cliente.anotacoes : []
  const atualizadas = anotacoes.filter(
    (item) => String(item?.id || "") !== String(historicoId)
  )

  if (atualizadas.length !== anotacoes.length) {
    await cliente.update({ anotacoes: atualizadas }, { transaction })
  }
}

async function registrarHistorico(cliente, servico, transaction) {
  if (!cliente) return

  const historicoId = servico.historicoId || `servico-avulso-${servico.id}`
  const anotacoes = Array.isArray(cliente.anotacoes) ? cliente.anotacoes : []
  const semRegistroAnterior = anotacoes.filter(
    (item) => String(item?.id || "") !== String(historicoId)
  )

  const anotacao = {
    id: historicoId,
    data: servico.data ? `${servico.data}T12:00:00.000Z` : new Date().toISOString(),
    tipo: "Serviço avulso",
    texto: textoHistorico(servico),
    servicoAvulsoId: servico.id,
  }

  await cliente.update(
    { anotacoes: [anotacao, ...semRegistroAnterior] },
    { transaction }
  )

  if (servico.historicoId !== historicoId) {
    await servico.update({ historicoId }, { transaction })
  }
}

async function sincronizarFinanceiro(servico, req, transaction) {
  const referenciaOrigem = referenciaFinanceiro(servico.id)
  let financeiro = null

  if (servico.financeiroId) {
    financeiro = await Financeiro.findOne({
      where: {
        id: servico.financeiroId,
        ...whereEmpresa(req),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  }

  if (!financeiro) {
    financeiro = await Financeiro.findOne({
      where: {
        referenciaOrigem,
        ...whereEmpresa(req),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  }

  const recebido = String(servico.status || "").toLowerCase() === "recebido"
  const dadosFinanceiro = {
    descricao: descricaoFinanceiro(servico),
    cliente: servico.cliente,
    tipo: "Receber",
    centroCusto: "Serviços Avulsos",
    formaPagamento: servico.formaPagamento || "",
    valor: moedaBanco(servico.valorTotal),
    vencimento: servico.data,
    status: recebido ? "Recebido" : "Pendente",
    dataRecebimento: recebido ? servico.data : "",
    origem: "Serviço Avulso",
    referenciaOrigem,
    anexos: [],
    empresaId: servico.empresaId || req.usuario?.empresaId || null,
  }

  if (financeiro) {
    await financeiro.update(dadosFinanceiro, { transaction })
  } else {
    financeiro = await Financeiro.create(dadosFinanceiro, { transaction })
  }

  if (Number(servico.financeiroId) !== Number(financeiro.id)) {
    await servico.update({ financeiroId: financeiro.id }, { transaction })
  }

  return financeiro
}

router.use(autenticar)
router.use(somenteEquipe)

router.get("/", async (req, res) => {
  try {
    const where = { ...whereEmpresa(req) }

    if (req.query.clienteId) {
      where.clienteId = Number(req.query.clienteId)
    }

    const registros = await ServicoAvulso.findAll({
      where,
      order: [["data", "DESC"], ["createdAt", "DESC"]],
    })

    res.json(registros)
  } catch (error) {
    console.error("ERRO AO LISTAR SERVIÇOS AVULSOS:", error)
    res.status(500).json({ message: "Erro ao listar serviços avulsos" })
  }
})

router.post("/", async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const clienteId = Number(req.body.clienteId)
    const cliente = await obterClienteValido(clienteId, req, transaction)

    if (!cliente) {
      await transaction.rollback()
      return res.status(404).json({ message: "Cliente não encontrado" })
    }

    const descricao = String(req.body.descricao || "").trim()
    if (!descricao) {
      await transaction.rollback()
      return res.status(400).json({ message: "Informe a descrição do serviço" })
    }

    const calculados = dadosCalculados(req.body)
    if (numeroSeguro(calculados.valorTotal) <= 0) {
      await transaction.rollback()
      return res.status(400).json({ message: "O valor final do serviço deve ser maior que zero" })
    }

    const data = req.body.data || new Date().toISOString().slice(0, 10)
    const status = String(req.body.status || "Recebido") === "Pendente"
      ? "Pendente"
      : "Recebido"

    const servico = await ServicoAvulso.create({
      clienteId: cliente.id,
      cliente: cliente.nome,
      servicoId: req.body.servicoId ? Number(req.body.servicoId) : null,
      descricao,
      ...calculados,
      data,
      status,
      formaPagamento: req.body.formaPagamento || "",
      observacao: req.body.observacao || "",
      empresaId: req.usuario?.empresaId || cliente.empresaId || null,
    }, { transaction })

    const financeiro = await sincronizarFinanceiro(servico, req, transaction)
    await registrarHistorico(cliente, servico, transaction)

    await transaction.commit()

    res.status(201).json({
      ...servico.toJSON(),
      financeiro,
    })
  } catch (error) {
    await transaction.rollback()
    console.error("ERRO AO CRIAR SERVIÇO AVULSO:", error)
    res.status(500).json({
      message: "Erro ao registrar serviço avulso",
      detalhe: error.message,
    })
  }
})

router.put("/:id", async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const servico = await ServicoAvulso.findOne({
      where: {
        id: req.params.id,
        ...whereEmpresa(req),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })

    if (!servico) {
      await transaction.rollback()
      return res.status(404).json({ message: "Serviço avulso não encontrado" })
    }

    const clienteAnterior = await obterClienteValido(servico.clienteId, req, transaction)
    const novoClienteId = req.body.clienteId !== undefined
      ? Number(req.body.clienteId)
      : Number(servico.clienteId)
    const clienteAtual = await obterClienteValido(novoClienteId, req, transaction)

    if (!clienteAtual) {
      await transaction.rollback()
      return res.status(404).json({ message: "Cliente não encontrado" })
    }

    const descricao = req.body.descricao !== undefined
      ? String(req.body.descricao || "").trim()
      : servico.descricao

    if (!descricao) {
      await transaction.rollback()
      return res.status(400).json({ message: "Informe a descrição do serviço" })
    }

    const calculados = dadosCalculados(req.body, servico)
    if (numeroSeguro(calculados.valorTotal) <= 0) {
      await transaction.rollback()
      return res.status(400).json({ message: "O valor final do serviço deve ser maior que zero" })
    }

    const status = req.body.status !== undefined
      ? (String(req.body.status) === "Pendente" ? "Pendente" : "Recebido")
      : servico.status

    await servico.update({
      clienteId: clienteAtual.id,
      cliente: clienteAtual.nome,
      servicoId: req.body.servicoId !== undefined
        ? (req.body.servicoId ? Number(req.body.servicoId) : null)
        : servico.servicoId,
      descricao,
      ...calculados,
      data: req.body.data || servico.data,
      status,
      formaPagamento: req.body.formaPagamento !== undefined
        ? req.body.formaPagamento
        : servico.formaPagamento,
      observacao: req.body.observacao !== undefined
        ? req.body.observacao
        : servico.observacao,
    }, { transaction })

    await sincronizarFinanceiro(servico, req, transaction)

    if (clienteAnterior && Number(clienteAnterior.id) !== Number(clienteAtual.id)) {
      await removerHistorico(clienteAnterior, servico.historicoId, transaction)
    }

    await registrarHistorico(clienteAtual, servico, transaction)
    await transaction.commit()

    res.json(servico)
  } catch (error) {
    await transaction.rollback()
    console.error("ERRO AO ATUALIZAR SERVIÇO AVULSO:", error)
    res.status(500).json({
      message: "Erro ao atualizar serviço avulso",
      detalhe: error.message,
    })
  }
})

router.delete("/:id", async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const servico = await ServicoAvulso.findOne({
      where: {
        id: req.params.id,
        ...whereEmpresa(req),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })

    if (!servico) {
      await transaction.rollback()
      return res.status(404).json({ message: "Serviço avulso não encontrado" })
    }

    const cliente = await obterClienteValido(servico.clienteId, req, transaction)

    if (servico.financeiroId) {
      await Financeiro.destroy({
        where: {
          id: servico.financeiroId,
          ...whereEmpresa(req),
        },
        transaction,
      })
    }

    await Financeiro.destroy({
      where: {
        referenciaOrigem: referenciaFinanceiro(servico.id),
        ...whereEmpresa(req),
      },
      transaction,
    })

    await removerHistorico(cliente, servico.historicoId, transaction)
    await servico.destroy({ transaction })
    await transaction.commit()

    res.json({ message: "Serviço avulso excluído com sucesso" })
  } catch (error) {
    await transaction.rollback()
    console.error("ERRO AO EXCLUIR SERVIÇO AVULSO:", error)
    res.status(500).json({
      message: "Erro ao excluir serviço avulso",
      detalhe: error.message,
    })
  }
})

module.exports = router

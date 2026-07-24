const express = require("express")
const { Op } = require("sequelize")

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

function formatarData(valor) {
  if (!valor) return "não informado"
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-")
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(valor)
}

function statusSeguro(valor, padrao = "Pendente") {
  const status = String(valor || padrao).trim().toLowerCase()
  if (status === "recebido" || status === "pago") return "Recebido"
  if (status === "cancelado" || status === "cancelada") return "Cancelado"
  return "Pendente"
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
    `valor: ${formatarMoeda(servico.valorTotal)}`,
    `status: ${servico.status}`,
  ]

  if (desconto > 0) {
    partes.splice(1, 0, `subtotal: ${formatarMoeda(subtotal)}`, `desconto: ${formatarMoeda(desconto)}`)
  }

  if (servico.vencimento) {
    partes.push(`vencimento: ${formatarData(servico.vencimento)}`)
  }

  return `Serviço e cobrança — ${partes.join(" • ")}.`
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
  if (!Number.isInteger(Number(clienteId)) || Number(clienteId) <= 0) return null

  const cliente = await Cliente.findByPk(Number(clienteId), {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  })

  if (!cliente) return null

  if (
    req.usuario?.empresaId &&
    cliente.empresaId &&
    Number(cliente.empresaId) !== Number(req.usuario.empresaId)
  ) {
    return null
  }

  return cliente
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
  const registroAnterior = anotacoes.find(
    (item) => String(item?.id || "") === String(historicoId)
  )
  const semRegistroAnterior = anotacoes.filter(
    (item) => String(item?.id || "") !== String(historicoId)
  )

  const anotacao = {
    id: historicoId,
    data: servico.data ? `${servico.data}T12:00:00.000Z` : new Date().toISOString(),
    tipo: "Serviço e cobrança",
    texto: textoHistorico(servico),
    servicoAvulsoId: servico.id,
  }

  const historicoMudou = !registroAnterior
    || registroAnterior.data !== anotacao.data
    || registroAnterior.tipo !== anotacao.tipo
    || registroAnterior.texto !== anotacao.texto
    || Number(registroAnterior.servicoAvulsoId) !== Number(anotacao.servicoAvulsoId)

  if (historicoMudou) {
    await cliente.update(
      { anotacoes: [anotacao, ...semRegistroAnterior] },
      { transaction }
    )
  }

  if (servico.historicoId !== historicoId) {
    await servico.update({ historicoId }, { transaction })
  }
}

async function localizarFinanceiro(servico, req, transaction) {
  let financeiro = null
  const empresaIdAtual = req.usuario?.empresaId || servico.empresaId || null

  if (servico.financeiroId) {
    financeiro = await Financeiro.findByPk(servico.financeiroId, {
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    })

    if (
      financeiro &&
      empresaIdAtual &&
      financeiro.empresaId &&
      Number(financeiro.empresaId) !== Number(empresaIdAtual)
    ) {
      financeiro = null
    }
  }

  if (!financeiro && empresaIdAtual) {
    financeiro = await Financeiro.findOne({
      where: {
        referenciaOrigem: referenciaFinanceiro(servico.id),
        empresaId: empresaIdAtual,
      },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    })
  }

  if (!financeiro) {
    const where = {
      referenciaOrigem: referenciaFinanceiro(servico.id),
    }

    if (empresaIdAtual) {
      where.empresaId = { [Op.is]: null }
    }

    financeiro = await Financeiro.findOne({
      where,
      order: [["updatedAt", "DESC"]],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    })
  }

  return financeiro
}

async function removerFinanceiroVinculado(servico, req, transaction) {
  const financeiro = await localizarFinanceiro(servico, req, transaction)

  if (financeiro) {
    await financeiro.destroy({ transaction })
  }

  await Financeiro.destroy({
    where: {
      referenciaOrigem: referenciaFinanceiro(servico.id),
      ...whereEmpresa(req),
    },
    transaction,
  })

  if (servico.financeiroId) {
    await servico.update({ financeiroId: null }, { transaction })
  }
}

async function sincronizarFinanceiro(servico, req, transaction) {
  if (statusSeguro(servico.status) === "Cancelado") {
    await removerFinanceiroVinculado(servico, req, transaction)
    return null
  }

  let financeiro = await localizarFinanceiro(servico, req, transaction)
  const recebido = statusSeguro(servico.status) === "Recebido"
  const empresaId = req.usuario?.empresaId || servico.empresaId || null

  if (empresaId && Number(servico.empresaId) !== Number(empresaId)) {
    await servico.update({ empresaId }, { transaction })
  }
  const vencimento = servico.vencimento || servico.data
  const dataRecebimento = recebido
    ? (servico.dataRecebimento || servico.data || new Date().toISOString().slice(0, 10))
    : ""

  const dadosFinanceiro = {
    clienteId: servico.clienteId,
    descricao: descricaoFinanceiro(servico),
    cliente: servico.cliente,
    tipo: "Receber",
    centroCusto: "Serviços e Cobranças",
    formaPagamento: servico.formaPagamento || "",
    valor: moedaBanco(servico.valorTotal),
    vencimento,
    status: recebido ? "Recebido" : "Pendente",
    dataRecebimento,
    origem: "Serviço do Cliente",
    referenciaOrigem: referenciaFinanceiro(servico.id),
    anexos: [],
    empresaId,
  }

  if (financeiro) {
    await financeiro.update(dadosFinanceiro, { transaction })
  } else {
    financeiro = await Financeiro.create(dadosFinanceiro, { transaction })
  }

  if (Number(servico.financeiroId) !== Number(financeiro.id)) {
    await servico.update({ financeiroId: financeiro.id }, { transaction })
  }

  const confirmado = await Financeiro.findByPk(financeiro.id, { transaction })
  if (!confirmado) {
    throw new Error(`Falha ao confirmar o lançamento financeiro do serviço ${servico.id}`)
  }

  return confirmado
}

router.use(autenticar)
router.use(somenteEquipe)

router.get("/", async (req, res) => {
  try {
    const where = { ...whereEmpresa(req) }

    if (req.query.clienteId) {
      where.clienteId = Number(req.query.clienteId)
    }

    if (req.query.status) {
      where.status = statusSeguro(req.query.status)
    }

    const registros = await ServicoAvulso.findAll({
      where,
      order: [["vencimento", "ASC"], ["data", "DESC"], ["createdAt", "DESC"]],
    })

    res.json(registros)
  } catch (error) {
    console.error("ERRO AO LISTAR SERVIÇOS E COBRANÇAS:", error)
    res.status(500).json({ message: "Erro ao listar serviços e cobranças" })
  }
})

router.post("/sincronizar-financeiro", async (req, res) => {
  const transaction = await sequelize.transaction()

  try {
    const where = { ...whereEmpresa(req) }
    if (req.body?.clienteId) where.clienteId = Number(req.body.clienteId)

    const registros = await ServicoAvulso.findAll({
      where,
      transaction,
      lock: transaction.LOCK.UPDATE,
    })

    let criadosOuAtualizados = 0
    let cancelados = 0

    for (const servico of registros) {
      const cliente = await obterClienteValido(servico.clienteId, req, transaction)
      if (!cliente) continue

      const atualizacoes = {}
      if (!servico.vencimento) atualizacoes.vencimento = servico.data
      if (statusSeguro(servico.status) === "Recebido" && !servico.dataRecebimento) {
        atualizacoes.dataRecebimento = servico.data
      }
      if (servico.cliente !== cliente.nome) atualizacoes.cliente = cliente.nome
      if (Object.keys(atualizacoes).length) await servico.update(atualizacoes, { transaction })

      const financeiro = await sincronizarFinanceiro(servico, req, transaction)
      if (financeiro) criadosOuAtualizados += 1
      else cancelados += 1

      await registrarHistorico(cliente, servico, transaction)
    }

    await transaction.commit()
    res.json({
      message: "Serviços e cobranças sincronizados com o Financeiro do Escritório",
      total: registros.length,
      criadosOuAtualizados,
      cancelados,
    })
  } catch (error) {
    await transaction.rollback()
    console.error("ERRO AO SINCRONIZAR SERVIÇOS E COBRANÇAS:", error)
    res.status(500).json({
      message: "Erro ao sincronizar serviços e cobranças",
      detalhe: error.message,
    })
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
    const vencimento = req.body.vencimento || data
    const status = statusSeguro(req.body.status, "Pendente")
    const dataRecebimento = status === "Recebido"
      ? (req.body.dataRecebimento || data)
      : null

    const servico = await ServicoAvulso.create({
      clienteId: cliente.id,
      cliente: cliente.nome,
      servicoId: req.body.servicoId ? Number(req.body.servicoId) : null,
      descricao,
      ...calculados,
      data,
      vencimento,
      dataRecebimento,
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
    console.error("ERRO AO CRIAR SERVIÇO E COBRANÇA:", error)
    res.status(500).json({
      message: "Erro ao registrar serviço e cobrança",
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
      return res.status(404).json({ message: "Serviço e cobrança não encontrado" })
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
      ? statusSeguro(req.body.status)
      : statusSeguro(servico.status)
    const data = req.body.data || servico.data
    const vencimento = req.body.vencimento || servico.vencimento || data
    const dataRecebimento = status === "Recebido"
      ? (req.body.dataRecebimento || servico.dataRecebimento || new Date().toISOString().slice(0, 10))
      : null

    await servico.update({
      clienteId: clienteAtual.id,
      cliente: clienteAtual.nome,
      servicoId: req.body.servicoId !== undefined
        ? (req.body.servicoId ? Number(req.body.servicoId) : null)
        : servico.servicoId,
      descricao,
      ...calculados,
      data,
      vencimento,
      dataRecebimento,
      status,
      formaPagamento: req.body.formaPagamento !== undefined
        ? req.body.formaPagamento
        : servico.formaPagamento,
      observacao: req.body.observacao !== undefined
        ? req.body.observacao
        : servico.observacao,
    }, { transaction })

    const financeiro = await sincronizarFinanceiro(servico, req, transaction)

    if (clienteAnterior && Number(clienteAnterior.id) !== Number(clienteAtual.id)) {
      await removerHistorico(clienteAnterior, servico.historicoId, transaction)
    }

    await registrarHistorico(clienteAtual, servico, transaction)
    await transaction.commit()

    res.json({
      ...servico.toJSON(),
      financeiro,
    })
  } catch (error) {
    await transaction.rollback()
    console.error("ERRO AO ATUALIZAR SERVIÇO E COBRANÇA:", error)
    res.status(500).json({
      message: "Erro ao atualizar serviço e cobrança",
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
      return res.status(404).json({ message: "Serviço e cobrança não encontrado" })
    }

    const cliente = await obterClienteValido(servico.clienteId, req, transaction)

    await removerFinanceiroVinculado(servico, req, transaction)
    await removerHistorico(cliente, servico.historicoId, transaction)
    await servico.destroy({ transaction })
    await transaction.commit()

    res.json({ message: "Serviço e cobrança excluído com sucesso" })
  } catch (error) {
    await transaction.rollback()
    console.error("ERRO AO EXCLUIR SERVIÇO E COBRANÇA:", error)
    res.status(500).json({
      message: "Erro ao excluir serviço e cobrança",
      detalhe: error.message,
    })
  }
})

module.exports = router

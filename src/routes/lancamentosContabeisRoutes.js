const express = require("express")

const LancamentoContabil = require("../models/LancamentoContabil")
const MovimentoCliente = require("../models/MovimentoCliente")
const upload = require("../middlewares/upload")
const { normalizarDataMovimento, competenciaDaData } = require("../services/dataMovimentoService")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()


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

function numeroParaBanco(valor) {
  return numeroSeguro(valor).toFixed(2)
}

function validarDataNova(valor) {
  const resultado = normalizarDataMovimento(valor)
  return resultado.valida && !resultado.corrigida ? resultado.data : null
}

function movimentoIdDoLancamento(lancamento) {
  const idDireto = Number(lancamento?.movimentoClienteId)
  if (Number.isInteger(idDireto) && idDireto > 0) return idDireto

  const achou = String(lancamento?.observacao || "").match(/^movimento-cliente:(\d+)$/i)
  return achou ? Number(achou[1]) : null
}

async function sincronizarMovimentoDoLancamento(
  lancamento,
  transaction = null
) {
  let movimento = null
  const movimentoId = movimentoIdDoLancamento(lancamento)

  if (movimentoId) {
    movimento = await MovimentoCliente.findByPk(movimentoId, { transaction })
  }

  const dadosMovimento = {
    cliente: lancamento.cliente,
    tipo: String(lancamento.tipo || "").toLowerCase() === "receita"
      ? "Receita"
      : "Despesa",
    data: lancamento.data,
    planoContaNome: lancamento.planoConta || "Lançamento Contábil",
    forma: lancamento.formaPagamento || "",
    formaPagamento: lancamento.formaPagamento || "",
    descricao: lancamento.descricao || "Lançamento contábil",
    valor: numeroSeguro(lancamento.valor),
    status: movimento?.status || "Pendente",
  }

  if (movimento) {
    await movimento.update(dadosMovimento, { transaction })
    return movimento
  }

  movimento = await MovimentoCliente.create({
    ...dadosMovimento,
    observacao: `lancamento-contabil:${lancamento.id}`,
  }, { transaction })

  await lancamento.update({
    movimentoClienteId: movimento.id,
  }, { transaction })

  return movimento
}

async function removerMovimentoDoLancamento(
  lancamento,
  transaction = null
) {
  const movimentoId = movimentoIdDoLancamento(lancamento)
  if (!movimentoId) return

  const movimento = await MovimentoCliente.findByPk(movimentoId, { transaction })
  if (movimento) {
    await movimento.destroy({ transaction })
  }
}

async function corrigirEFiltrarDatasLegadas(lancamentos) {
  const validos = []
  for (const lancamento of lancamentos) {
    const resultado = normalizarDataMovimento(lancamento.data)
    if (!resultado.valida) {
      console.warn(`Lançamento contábil ${lancamento.id} ignorado por data inválida: ${lancamento.data}`)
      continue
    }
    if (resultado.corrigida) {
      await lancamento.update({ data: resultado.data, competencia: competenciaDaData(resultado.data) })
      console.warn(`Lançamento contábil ${lancamento.id} corrigido para ${resultado.data}`)
    }
    validos.push(lancamento)
  }
  return validos
}


function somenteEquipe(req, res, next) {
  if (!["Administrador", "Funcionário"].includes(req.usuario.perfil)) {
    return res.status(403).json({ message: "Acesso negado" })
  }

  next()
}


router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      where.cliente = req.usuario.clienteVinculado
    }

    if (req.usuario.empresaId) {
      where.empresaId = req.usuario.empresaId
    }

    const lancamentos = await LancamentoContabil.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(await corrigirEFiltrarDatasLegadas(lancamentos))
  } catch (error) {
    console.error("ERRO AO LISTAR LANÇAMENTOS:", error)

    res.status(500).json({
      message: "Erro ao listar lançamentos",
    })
  }
})

router.post("/", autenticar, somenteEquipe, async (req, res) => {
  const transaction = await LancamentoContabil.sequelize.transaction()

  try {
    if (String(req.body.origem || "").toLowerCase() === "servico") {
      await transaction.rollback()
      return res.status(400).json({
        message: "Serviços do escritório devem ser registrados em Serviços Avulsos",
      })
    }

    const dataInformada = req.body.data || new Date().toISOString().slice(0, 10)
    const data = validarDataNova(dataInformada)

    if (!data) {
      await transaction.rollback()
      return res.status(400).json({
        message: "Data inválida. Corrija o ano antes de salvar.",
      })
    }

    const competencia = competenciaDaData(data)

    const tipoContabil =
      String(req.body.tipo || "").toLowerCase() === "receita"
        ? "Receita"
        : "Despesa"

    const planoConta =
      req.body.planoConta ||
      req.body.categoria ||
      "Lançamento Manual"

    const quantidade = quantidadeSegura(req.body.quantidade)

    const valorUnitarioNumerico =
      req.body.valorUnitario !== undefined &&
      req.body.valorUnitario !== null
        ? numeroSeguro(req.body.valorUnitario)
        : numeroSeguro(req.body.valor) / quantidade

    const valorTotalNumerico = valorUnitarioNumerico * quantidade
    const valorUnitario = numeroParaBanco(valorUnitarioNumerico)
    const valor = numeroParaBanco(valorTotalNumerico)

    const novoLancamento = await LancamentoContabil.create({
      cliente: req.body.cliente,
      data,
      competencia,
      tipo: tipoContabil,
      planoConta,
      descricao:
        req.body.descricao ||
        "Lançamento contábil",
      quantidade,
      valorUnitario,
      valor,
      formaPagamento:
        req.body.formaPagamento || "",
      origem: "Escritório",
      observacao: req.body.observacao || "",
      anexos:
        req.body.anexos || [],
      empresaId:
        req.usuario?.empresaId || null,
    }, { transaction })

    await sincronizarMovimentoDoLancamento(
      novoLancamento,
      transaction
    )

    await transaction.commit()

    res.status(201).json(novoLancamento)
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }

    console.error("ERRO AO CRIAR LANÇAMENTO:", error)

    res.status(500).json({
      message:
        "Erro ao criar lançamento. A gravação foi desfeita para manter Contabilidade e Movimentos sincronizados.",
      erro: error.message,
    })
  }
})

router.put("/:id", autenticar, somenteEquipe, async (req, res) => {
  const transaction = await LancamentoContabil.sequelize.transaction()

  try {
    const lancamento = await LancamentoContabil.findByPk(
      req.params.id,
      { transaction }
    )

    if (!lancamento) {
      await transaction.rollback()
      return res.status(404).json({
        message: "Lançamento não encontrado",
      })
    }

    const dadosAtualizados = { ...req.body }

    // Origem registra quem criou o lançamento. Uma correção feita pelo
    // escritório não muda a origem original de um lançamento do cliente.
    delete dadosAtualizados.origem
    delete dadosAtualizados.observacao

    const resultadoData = normalizarDataMovimento(
      req.body.data !== undefined
        ? req.body.data
        : lancamento.data
    )

    if (
      !resultadoData.valida ||
      (req.body.data !== undefined && resultadoData.corrigida)
    ) {
      await transaction.rollback()
      return res.status(400).json({
        message: "Data inválida. Corrija o ano antes de salvar.",
      })
    }

    dadosAtualizados.data = resultadoData.data
    dadosAtualizados.competencia = competenciaDaData(resultadoData.data)

    const quantidadeAtual = quantidadeSegura(lancamento.quantidade)
    const quantidade =
      req.body.quantidade !== undefined
        ? quantidadeSegura(req.body.quantidade)
        : quantidadeAtual

    let valorUnitarioNumerico

    if (
      req.body.valorUnitario !== undefined &&
      req.body.valorUnitario !== null
    ) {
      valorUnitarioNumerico = numeroSeguro(req.body.valorUnitario)
    } else if (
      req.body.valor !== undefined &&
      req.body.valor !== null
    ) {
      valorUnitarioNumerico =
        numeroSeguro(req.body.valor) / quantidade
    } else if (
      lancamento.valorUnitario !== null &&
      lancamento.valorUnitario !== undefined &&
      lancamento.valorUnitario !== ""
    ) {
      valorUnitarioNumerico =
        numeroSeguro(lancamento.valorUnitario)
    } else {
      valorUnitarioNumerico =
        numeroSeguro(lancamento.valor) / quantidadeAtual
    }

    dadosAtualizados.quantidade = quantidade
    dadosAtualizados.valorUnitario =
      numeroParaBanco(valorUnitarioNumerico)
    dadosAtualizados.valor =
      numeroParaBanco(valorUnitarioNumerico * quantidade)

    if (req.body.tipo !== undefined) {
      dadosAtualizados.tipo =
        String(req.body.tipo || "").toLowerCase() === "receita"
          ? "Receita"
          : "Despesa"
    }

    if (!lancamento.origem) {
      dadosAtualizados.origem =
        movimentoIdDoLancamento(lancamento)
          ? "Cliente"
          : "Escritório"
    }

    await lancamento.update(dadosAtualizados, { transaction })

    await sincronizarMovimentoDoLancamento(
      lancamento,
      transaction
    )

    await transaction.commit()

    res.json(lancamento)
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }

    console.error("ERRO AO ATUALIZAR LANÇAMENTO:", error)

    res.status(500).json({
      message:
        "Erro ao atualizar lançamento. Nenhuma alteração parcial foi mantida.",
      erro: error.message,
    })
  }
})

router.delete("/:id", autenticar, somenteEquipe, async (req, res) => {
  const transaction = await LancamentoContabil.sequelize.transaction()

  try {
    const lancamento = await LancamentoContabil.findByPk(
      req.params.id,
      { transaction }
    )

    if (!lancamento) {
      await transaction.rollback()
      return res.status(404).json({
        message: "Lançamento não encontrado",
      })
    }

    await removerMovimentoDoLancamento(lancamento, transaction)
    await lancamento.destroy({ transaction })

    await transaction.commit()

    res.json({
      message:
        "Lançamento excluído da Contabilidade e dos Movimentos do cliente.",
    })
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }

    console.error("ERRO AO EXCLUIR LANÇAMENTO:", error)

    res.status(500).json({
      message:
        "Erro ao excluir lançamento. Nenhuma exclusão parcial foi mantida.",
      erro: error.message,
    })
  }
})

module.exports = router

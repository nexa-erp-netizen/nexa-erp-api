const sequelize = require("../config/database")

function normalizar(valor) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function encerrado(status) {
  return /^(pago|paga|recebido|recebida|concluido|concluida|quitado|quitada|finalizado|finalizada)$/.test(normalizar(status))
}

function numero(valor) {
  const texto = String(valor ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")
  const convertido = Number(texto)
  return Number.isFinite(convertido) ? convertido : null
}

function mesmaData(a, b) {
  return String(a || "").slice(0, 10) === String(b || "").slice(0, 10)
}

function achado({ codigo, nivel = "Médio", resumo, registros, correcaoPreparavel = null }) {
  return { codigo, nivel, resumo, registros, correcaoPreparavel }
}

async function detectarInconsistenciasCliente({ clienteId, clienteNome }) {
  const { Financeiro, ServicoAvulso, DasMei, Fiscal, MovimentoCliente, LancamentoContabil } = sequelize.models
  const [financeiros, servicos, guias, fiscais, movimentos, lancamentos] = await Promise.all([
    Financeiro?.findAll({ where: { clienteId }, limit: 200 }) || [],
    ServicoAvulso?.findAll({ where: { clienteId }, limit: 200 }) || [],
    DasMei?.findAll({ where: { clienteId }, limit: 200 }) || [],
    Fiscal?.findAll({ where: { cliente: clienteNome }, limit: 200 }) || [],
    MovimentoCliente?.findAll({ where: { cliente: clienteNome }, limit: 300 }) || [],
    LancamentoContabil?.findAll({ where: { cliente: clienteNome }, limit: 300 }) || [],
  ])
  const inconsistencias = []

  for (const servico of servicos) {
    const financeiro = servico.financeiroId ? financeiros.find((item) => Number(item.id) === Number(servico.financeiroId)) : null
    if (financeiro && encerrado(servico.status) !== encerrado(financeiro.status)) {
      inconsistencias.push(achado({
        codigo: "SERVICO_FINANCEIRO_STATUS_DIVERGENTE", nivel: "Alto",
        resumo: `O serviço #${servico.id} e o Financeiro #${financeiro.id} representam a mesma cobrança, mas possuem status diferentes.`,
        registros: [{ modelo: "ServicoAvulso", id: servico.id, status: servico.status, dataRecebimento: servico.dataRecebimento }, { modelo: "Financeiro", id: financeiro.id, status: financeiro.status, dataRecebimento: financeiro.dataRecebimento }],
        correcaoPreparavel: { exigeConfirmacao: true, orientacao: "Confirmar o pagamento e sincronizar o registro que ainda estiver aberto." },
      }))
    }
  }

  for (const item of [...financeiros.map((registro) => ({ modelo: "Financeiro", registro })), ...servicos.map((registro) => ({ modelo: "ServicoAvulso", registro }))]) {
    const temData = Boolean(item.registro.dataRecebimento)
    const estaRecebido = encerrado(item.registro.status)
    if (temData === estaRecebido) continue
    inconsistencias.push(achado({
      codigo: "RECEBIMENTO_INCOMPLETO", nivel: "Alto",
      resumo: `${item.modelo} #${item.registro.id} possui status e data de recebimento incompatíveis.`,
      registros: [{ modelo: item.modelo, id: item.registro.id, status: item.registro.status, dataRecebimento: item.registro.dataRecebimento }],
      correcaoPreparavel: { exigeConfirmacao: true, orientacao: "Confirmar se houve pagamento antes de ajustar status ou data." },
    }))
  }

  for (const guia of guias.filter((item) => encerrado(item.status))) {
    const fiscalAberto = fiscais.find((item) => normalizar(item.obrigacao).includes("das") && normalizar(item.competencia) === normalizar(guia.competencia) && !encerrado(item.status))
    if (!fiscalAberto) continue
    inconsistencias.push(achado({
      codigo: "DAS_PAGO_FISCAL_ABERTO", nivel: "Alto",
      resumo: `O DAS ${guia.competencia} está pago, mas a pendência Fiscal #${fiscalAberto.id} continua aberta.`,
      registros: [{ modelo: "DasMei", id: guia.id, competencia: guia.competencia, status: guia.status }, { modelo: "Fiscal", id: fiscalAberto.id, competencia: fiscalAberto.competencia, status: fiscalAberto.status }],
      correcaoPreparavel: { exigeConfirmacao: true, modelo: "Fiscal", registroId: fiscalAberto.id, alteracoes: { status: "Pago" } },
    }))
  }

  const chaves = new Map()
  for (const movimento of movimentos) {
    const chave = [normalizar(movimento.tipo), String(movimento.data).slice(0, 10), normalizar(movimento.descricao), numero(movimento.valor)].join("|")
    const anterior = chaves.get(chave)
    if (anterior) inconsistencias.push(achado({
      codigo: "MOVIMENTO_POSSIVEL_DUPLICIDADE",
      resumo: `Os movimentos #${anterior.id} e #${movimento.id} possuem a mesma data, descrição, tipo e valor.`,
      registros: [{ modelo: "MovimentoCliente", id: anterior.id }, { modelo: "MovimentoCliente", id: movimento.id }],
    }))
    else chaves.set(chave, movimento)
  }

  for (const movimento of movimentos.filter((item) => normalizar(item.status) === "conferido")) {
    const correspondente = lancamentos.find((item) => mesmaData(item.data, movimento.data) && normalizar(item.descricao) === normalizar(movimento.descricao) && numero(item.valor) === numero(movimento.valor))
    if (!correspondente) inconsistencias.push(achado({
      codigo: "MOVIMENTO_CONFERIDO_SEM_LANCAMENTO",
      resumo: `O movimento #${movimento.id} está conferido, mas não encontrei lançamento contábil correspondente pelos dados disponíveis.`,
      registros: [{ modelo: "MovimentoCliente", id: movimento.id, data: movimento.data, descricao: movimento.descricao, valor: movimento.valor }],
    }))
  }

  return { clienteId, cliente: clienteNome, modulosVerificados: ["Financeiro", "ServicoAvulso", "DasMei", "Fiscal", "MovimentoCliente", "LancamentoContabil"], total: inconsistencias.length, inconsistencias: inconsistencias.slice(0, 100), alteracaoExecutada: false }
}

module.exports = { detectarInconsistenciasCliente, encerrado, numero }

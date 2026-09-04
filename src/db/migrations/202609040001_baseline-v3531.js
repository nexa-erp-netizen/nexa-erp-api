const { DataTypes } = require("sequelize")

function nomeTabelaDoModelo(sequelize, nomeModelo) {
  const modelo = sequelize.models[nomeModelo]
  if (!modelo) {
    throw new Error(`Modelo não registrado para migration: ${nomeModelo}`)
  }

  const tabela = modelo.getTableName()
  return typeof tabela === "string" ? tabela : tabela.tableName
}

async function tabelasExistentes(queryInterface) {
  const tabelas = await queryInterface.showAllTables()
  return new Set((tabelas || []).map(item => {
    if (typeof item === "string") return item
    return item.tableName || item.name || String(item)
  }))
}

async function garantirTabelaDoModelo({ sequelize, queryInterface, transaction, nomeModelo }) {
  const modelo = sequelize.models[nomeModelo]
  if (!modelo) throw new Error(`Modelo não registrado: ${nomeModelo}`)

  const nomeTabela = nomeTabelaDoModelo(sequelize, nomeModelo)
  const existentes = await tabelasExistentes(queryInterface)

  if (!existentes.has(nomeTabela)) {
    // Cria apenas uma tabela totalmente ausente. Nunca altera tabela existente.
    await modelo.sync({ force: false, alter: false, transaction })
  }

  return nomeTabela
}

async function garantirColuna({ queryInterface, tabela, coluna, definicao, transaction }) {
  const descricao = await queryInterface.describeTable(tabela, { transaction })
  if (descricao[coluna]) return false

  await queryInterface.addColumn(tabela, coluna, definicao, { transaction })
  return true
}

async function garantirIndice({ queryInterface, tabela, campos, unique = false, nome, transaction }) {
  const indices = await queryInterface.showIndex(tabela, { transaction })
  const alvo = campos.join("|")
  const existe = (indices || []).some(indice => {
    const atuais = (indice.fields || []).map(campo => campo.attribute || campo.name).join("|")
    return atuais === alvo && Boolean(indice.unique) === Boolean(unique)
  })

  if (existe) return false

  await queryInterface.addIndex(tabela, campos, {
    name: nome,
    unique,
    transaction,
  })
  return true
}

async function up({ sequelize, queryInterface, transaction }) {
  // Esta migration é a fotografia controlada do esquema já usado pela v3.53.1.
  // Ela é somente aditiva: não remove coluna, não troca tipo e não apaga dado.

  const movimentoCliente = nomeTabelaDoModelo(sequelize, "MovimentoCliente")
  const lancamentoContabil = nomeTabelaDoModelo(sequelize, "LancamentoContabil")
  const movimentoBancario = nomeTabelaDoModelo(sequelize, "MovimentoBancario")

  const existentes = await tabelasExistentes(queryInterface)
  for (const tabela of [movimentoCliente, lancamentoContabil, movimentoBancario]) {
    if (!existentes.has(tabela)) {
      throw new Error(`Tabela essencial ausente antes da baseline: ${tabela}`)
    }
  }

  await garantirColuna({
    queryInterface,
    tabela: movimentoCliente,
    coluna: "clienteId",
    definicao: { type: DataTypes.INTEGER, allowNull: true },
    transaction,
  })

  await garantirColuna({
    queryInterface,
    tabela: lancamentoContabil,
    coluna: "clienteId",
    definicao: { type: DataTypes.INTEGER, allowNull: true },
    transaction,
  })
  await garantirColuna({
    queryInterface,
    tabela: lancamentoContabil,
    coluna: "formaPagamento",
    definicao: { type: DataTypes.STRING, allowNull: true },
    transaction,
  })
  await garantirColuna({
    queryInterface,
    tabela: lancamentoContabil,
    coluna: "origem",
    definicao: { type: DataTypes.STRING, allowNull: true },
    transaction,
  })
  await garantirColuna({
    queryInterface,
    tabela: lancamentoContabil,
    coluna: "movimentoClienteId",
    definicao: { type: DataTypes.INTEGER, allowNull: true },
    transaction,
  })

  const ajustesMovimentoBancario = {
    ajusteComparacao: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    ajusteTipo: { type: DataTypes.STRING(40), allowNull: true },
    ajusteMovimentoClienteReferenciaId: { type: DataTypes.INTEGER, allowNull: true },
    ajusteMovimentoClienteGeradoId: { type: DataTypes.INTEGER, allowNull: true },
    ajusteLancamentoContabilGeradoId: { type: DataTypes.INTEGER, allowNull: true },
    ajusteObservacao: { type: DataTypes.TEXT, allowNull: true },
    ajusteStatusAnterior: { type: DataTypes.STRING, allowNull: true },
    ajusteObservacoesAnterior: { type: DataTypes.TEXT, allowNull: true },
    ajustadoEm: { type: DataTypes.DATE, allowNull: true },
    ajustadoPor: { type: DataTypes.STRING, allowNull: true },
    ajusteHistorico: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  }

  for (const [coluna, definicao] of Object.entries(ajustesMovimentoBancario)) {
    await garantirColuna({
      queryInterface,
      tabela: movimentoBancario,
      coluna,
      definicao,
      transaction,
    })
  }

  const idempotencias = await garantirTabelaDoModelo({
    sequelize,
    queryInterface,
    transaction,
    nomeModelo: "IdempotenciaOperacao",
  })

  const auditoriaBackup = await garantirTabelaDoModelo({
    sequelize,
    queryInterface,
    transaction,
    nomeModelo: "AuditoriaBackup",
  })

  // Confirma que as tabelas criadas nas versões recentes têm as colunas de isolamento.
  for (const tabela of [idempotencias, auditoriaBackup]) {
    await garantirColuna({
      queryInterface,
      tabela,
      coluna: "escritorioId",
      definicao: { type: DataTypes.INTEGER, allowNull: true },
      transaction,
    })
  }

  await garantirIndice({
    queryInterface,
    tabela: movimentoCliente,
    campos: ["escritorioId", "clienteId"],
    nome: "idx_movimento_cliente_escritorio_cliente",
    transaction,
  })
  await garantirIndice({
    queryInterface,
    tabela: lancamentoContabil,
    campos: ["escritorioId", "clienteId"],
    nome: "idx_lancamento_contabil_escritorio_cliente",
    transaction,
  })
  await garantirIndice({
    queryInterface,
    tabela: idempotencias,
    campos: ["chaveHash"],
    unique: true,
    nome: "uq_idempotencias_operacoes_chave_hash",
    transaction,
  })
  await garantirIndice({
    queryInterface,
    tabela: idempotencias,
    campos: ["expiraEm"],
    nome: "idx_idempotencias_operacoes_expira_em",
    transaction,
  })
  await garantirIndice({
    queryInterface,
    tabela: idempotencias,
    campos: ["escritorioId", "expiraEm"],
    nome: "idx_idempotencias_operacoes_escritorio_expira",
    transaction,
  })
}

module.exports = { up }

const { DataTypes } = require("sequelize")

function nomeTabela(sequelize, modelo) {
  const tabela = sequelize.models[modelo].getTableName()
  return typeof tabela === "string" ? tabela : tabela.tableName
}

async function adicionarSeAusente(queryInterface, tabela, coluna, definicao, transaction) {
  const descricao = await queryInterface.describeTable(tabela, { transaction })
  if (!descricao[coluna]) await queryInterface.addColumn(tabela, coluna, definicao, { transaction })
}

async function up({ sequelize, queryInterface, transaction }) {
  const escritorios = nomeTabela(sequelize, "Escritorio")
  await adicionarSeAusente(queryInterface, escritorios, "primeiroAcessoEm", { type: DataTypes.DATE, allowNull: true }, transaction)
  await adicionarSeAusente(queryInterface, escritorios, "ultimoAcessoEm", { type: DataTypes.DATE, allowNull: true }, transaction)
  await adicionarSeAusente(queryInterface, escritorios, "ultimaAtividadeEm", { type: DataTypes.DATE, allowNull: true }, transaction)
  await adicionarSeAusente(queryInterface, escritorios, "totalAcessos", { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, transaction)
  await adicionarSeAusente(queryInterface, escritorios, "ultimoAcessoUsuarioNome", { type: DataTypes.STRING, allowNull: true }, transaction)
  await adicionarSeAusente(queryInterface, escritorios, "ultimoAcessoIp", { type: DataTypes.STRING(80), allowNull: true }, transaction)
  await adicionarSeAusente(queryInterface, escritorios, "ultimoAcessoDispositivo", { type: DataTypes.STRING(160), allowNull: true }, transaction)
}

module.exports = { up }

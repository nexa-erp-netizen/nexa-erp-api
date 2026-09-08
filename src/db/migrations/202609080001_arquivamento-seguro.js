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
  const usuarios = nomeTabela(sequelize, "Usuario")
  const escritorios = nomeTabela(sequelize, "Escritorio")

  await adicionarSeAusente(queryInterface, usuarios, "arquivadoEm", { type: DataTypes.DATE, allowNull: true }, transaction)
  await adicionarSeAusente(queryInterface, usuarios, "arquivadoPorUsuarioId", { type: DataTypes.INTEGER, allowNull: true }, transaction)
  await adicionarSeAusente(queryInterface, escritorios, "arquivadoEm", { type: DataTypes.DATE, allowNull: true }, transaction)
  await adicionarSeAusente(queryInterface, escritorios, "arquivadoPorUsuarioId", { type: DataTypes.INTEGER, allowNull: true }, transaction)
}

module.exports = { up }

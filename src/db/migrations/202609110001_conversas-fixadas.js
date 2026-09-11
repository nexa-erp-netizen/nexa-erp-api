const { DataTypes } = require("sequelize")

async function up({ sequelize, queryInterface, transaction }) {
  const modelo = sequelize.models.ConversaNexa
  if (!modelo) throw new Error("Modelo ConversaNexa não registrado")

  const tabelaModelo = modelo.getTableName()
  const tabela = typeof tabelaModelo === "string" ? tabelaModelo : tabelaModelo.tableName
  const descricao = await queryInterface.describeTable(tabela, { transaction })

  if (!descricao.fixada) {
    await queryInterface.addColumn(tabela, "fixada", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    }, { transaction })
  }
}

module.exports = { up }

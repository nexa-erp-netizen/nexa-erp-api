const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const SolicitacaoCliente = sequelize.define("SolicitacaoCliente", {
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  titulo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  categoria: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  mensagem: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Aberta",
  },

  anexos: {
    type: DataTypes.JSON,
    allowNull: true,
  },
})

module.exports = SolicitacaoCliente
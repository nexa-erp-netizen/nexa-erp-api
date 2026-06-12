const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Fiscal = sequelize.define("Fiscal", {
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  obrigacao: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  competencia: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  vencimento: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  status: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  valor: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  observacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  anexos: {
    type: DataTypes.JSON,
    allowNull: true,
  },

  diasParaVencer: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  alertaFiscal: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  empresaId: {
  type: DataTypes.INTEGER,
  allowNull: true,

  },
})

module.exports = Fiscal
const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Declaracao = sequelize.define("Declaracao", {
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  ano: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  vencimento: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Pendente",
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

  alerta: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
})

module.exports = Declaracao

const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Financeiro = sequelize.define("Financeiro", {
  descricao: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  valor: {
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

  anexos: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
  },

  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
})

module.exports = Financeiro
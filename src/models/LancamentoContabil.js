const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const LancamentoContabil = sequelize.define("LancamentoContabil", {
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  data: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  competencia: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  planoConta: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  descricao: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  quantidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },

  valorUnitario: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  valor: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  formaPagamento: {
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

  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
})

module.exports = LancamentoContabil
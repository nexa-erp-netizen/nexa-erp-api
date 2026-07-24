const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ServicoAvulso = sequelize.define("ServicoAvulso", {
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  servicoId: {
    type: DataTypes.INTEGER,
    allowNull: true,
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
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  desconto: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  valorTotal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
  },

  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },

  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Recebido",
  },

  formaPagamento: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  observacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  financeiroId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  historicoId: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
})

module.exports = ServicoAvulso

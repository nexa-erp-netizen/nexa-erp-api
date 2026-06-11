const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const MovimentoCliente = sequelize.define("MovimentoCliente", {
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  tipo: {
    type: DataTypes.ENUM("Receita", "Despesa"),
    allowNull: false,
  },

  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },

  planoContaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  planoContaNome: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  forma: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  descricao: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  valor: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },

  formaPagamento: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  comprovante: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  observacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM("Pendente", "Conferido", "Rejeitado"),
    defaultValue: "Pendente",
  },
})

module.exports = MovimentoCliente
const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ContaReceber = sequelize.define("ContaReceber", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  cliente_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  descricao: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  valor: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  valor_pago: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },

  vencimento: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },

  data_recebimento: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },

  status: {
    type: DataTypes.STRING,
    defaultValue: "Pendente",
  },

  recorrente: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  recorrencia_tipo: {
    type: DataTypes.STRING,
    defaultValue: "mensal",
  },

  forma_pagamento: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  observacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
})

module.exports = ContaReceber
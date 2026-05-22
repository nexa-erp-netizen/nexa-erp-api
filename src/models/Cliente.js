const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Cliente = sequelize.define("Cliente", {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  cpf: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  telefone: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  cnpj: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  regime: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  endereco: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  cidade: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  estado: {
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

  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
},
  },
})

module.exports = Cliente
const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Servico = sequelize.define("Servico", {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  categoria: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  prazo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  valor: {
    type: DataTypes.STRING,
    allowNull: false,
  },
})

module.exports = Servico
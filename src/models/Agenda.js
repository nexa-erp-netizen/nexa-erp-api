const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Agenda = sequelize.define("Agenda", {
  titulo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  cliente: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  data: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
  },
})

module.exports = Agenda
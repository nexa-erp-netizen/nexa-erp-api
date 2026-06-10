const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const PlanoConta = sequelize.define("PlanoConta", {
  codigo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  conta: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  natureza: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  formas: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },
})

module.exports = PlanoConta
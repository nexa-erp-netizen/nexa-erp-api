const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const FluxoCaixa = sequelize.define("FluxoCaixa", {

  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },

  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  descricao: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  categoria: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  valor: {
    type: DataTypes.DECIMAL(10,2),
    allowNull: false,
  },

  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },

  status: {
    type: DataTypes.STRING,
    defaultValue: "Previsto",
  }

})

module.exports = FluxoCaixa
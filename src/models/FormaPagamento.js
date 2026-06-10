const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const FormaPagamento = sequelize.define("FormaPagamento", {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  tipo: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  ativo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
})

module.exports = FormaPagamento
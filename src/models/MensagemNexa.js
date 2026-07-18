const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const MensagemNexa = sequelize.define("MensagemNexa", {
  conversaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  autor: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  texto: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  dados: {
    type: DataTypes.JSON,
    allowNull: true,
  },
})

module.exports = MensagemNexa

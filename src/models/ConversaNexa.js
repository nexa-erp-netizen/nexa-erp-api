const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ConversaNexa = sequelize.define("ConversaNexa", {
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  titulo: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Nova conversa",
  },
  tipoContexto: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "geral",
  },
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  interessadoNome: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  arquivada: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  ultimaMensagemEm: {
    type: DataTypes.DATE,
    allowNull: true,
  },
})

module.exports = ConversaNexa

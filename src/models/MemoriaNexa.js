const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const MemoriaNexa = sequelize.define("MemoriaNexa", {
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  escopo: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "escritorio",
  },
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  conversaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  categoria: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "preferencia",
  },
  conteudo: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  origem: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "usuario",
  },
  confirmada: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  ativa: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
})

module.exports = MemoriaNexa

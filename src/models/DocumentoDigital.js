const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const DocumentoDigital = sequelize.define("DocumentoDigital", {
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  anoCalendario: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  dataEnvio: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  recibo: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Arquivado",
  },

  observacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  anexos: {
    type: DataTypes.JSON,
    allowNull: true,
  },
})

module.exports = DocumentoDigital
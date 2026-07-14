const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ProcuracaoEcac = sequelize.define("ProcuracaoEcac", {
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Procuração e-CAC",
  },
  dataInicio: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  dataValidade: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  outorgante: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  outorgado: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  servicosAutorizados: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  responsavel: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ativa: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
})

module.exports = ProcuracaoEcac

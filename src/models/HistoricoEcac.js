const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const HistoricoEcac = sequelize.define("HistoricoEcac", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  servico: { type: DataTypes.STRING, allowNull: false },
  responsavel: { type: DataTypes.STRING, allowNull: true },
  observacoes: { type: DataTypes.TEXT, allowNull: true },
})

module.exports = HistoricoEcac

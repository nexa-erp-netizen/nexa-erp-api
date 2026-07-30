const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const HistoricoCredencialFiscal = sequelize.define("HistoricoCredencialFiscal", {
  credencialId: { type: DataTypes.INTEGER, allowNull: true },
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  acao: { type: DataTypes.STRING, allowNull: false },
  metodo: { type: DataTypes.STRING, allowNull: false },
  usuario: { type: DataTypes.STRING, allowNull: true },
  detalhes: { type: DataTypes.TEXT, allowNull: true },
})

module.exports = HistoricoCredencialFiscal

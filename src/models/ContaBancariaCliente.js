const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ContaBancariaCliente = sequelize.define("ContaBancariaCliente", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  bancoCodigo: { type: DataTypes.STRING(10), allowNull: true },
  bancoNome: { type: DataTypes.STRING, allowNull: false },
  agencia: { type: DataTypes.STRING(20), allowNull: false },
  conta: { type: DataTypes.STRING(30), allowNull: false },
  digito: { type: DataTypes.STRING(5), allowNull: true },
  tipoConta: { type: DataTypes.STRING, allowNull: false, defaultValue: "Conta corrente" },
  moeda: { type: DataTypes.STRING(3), allowNull: false, defaultValue: "BRL" },
  saldoInicial: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  dataSaldoInicial: { type: DataTypes.DATEONLY, allowNull: true },
  principal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  observacoes: { type: DataTypes.TEXT, allowNull: true },
})

module.exports = ContaBancariaCliente

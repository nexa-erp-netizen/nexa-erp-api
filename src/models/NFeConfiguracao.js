const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const NFeConfiguracao = sequelize.define("NFeConfiguracao", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  ambiente: { type: DataTypes.STRING, allowNull: false, defaultValue: "homologacao" },
  serie: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  proximoNumero: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  crt: { type: DataTypes.STRING, allowNull: true },
  naturezaOperacao: { type: DataTypes.STRING, allowNull: true, defaultValue: "Venda de mercadoria" },
  certificadoDigitalId: { type: DataTypes.INTEGER, allowNull: true },
  provedor: { type: DataTypes.STRING, allowNull: true },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
})

module.exports = NFeConfiguracao

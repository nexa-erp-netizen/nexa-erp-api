const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const NFSe = sequelize.define("NFSe", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  numero: { type: DataTypes.INTEGER, allowNull: true },
  numeroDps: { type: DataTypes.INTEGER, allowNull: true },
  serieDps: { type: DataTypes.STRING, allowNull: false, defaultValue: "70000" },
  ambiente: { type: DataTypes.STRING, allowNull: false, defaultValue: "homologacao" },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "rascunho" },
  tomador: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  servicos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  competencia: { type: DataTypes.DATEONLY, allowNull: false },
  valorServicos: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  valorDeducoes: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  baseCalculo: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  valorIss: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  valorRetencoesFederais: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  valorLiquido: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  codigoVerificacao: { type: DataTypes.STRING, allowNull: true },
  xmlUrl: { type: DataTypes.TEXT, allowNull: true },
  danfseUrl: { type: DataTypes.TEXT, allowNull: true },
  erroEmissao: { type: DataTypes.TEXT, allowNull: true },
  emitidaEm: { type: DataTypes.DATE, allowNull: true },
})

module.exports = NFSe

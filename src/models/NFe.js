const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const NFe = sequelize.define("NFe", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  numero: { type: DataTypes.INTEGER, allowNull: true },
  serie: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  ambiente: { type: DataTypes.STRING, allowNull: false, defaultValue: "homologacao" },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "rascunho" },
  naturezaOperacao: { type: DataTypes.STRING, allowNull: false, defaultValue: "Venda de mercadoria" },
  destinatario: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  itens: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  valorProdutos: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  valorFrete: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  valorDesconto: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  valorTotal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  chaveAcesso: { type: DataTypes.STRING, allowNull: true },
  protocolo: { type: DataTypes.STRING, allowNull: true },
  xmlUrl: { type: DataTypes.TEXT, allowNull: true },
  danfeUrl: { type: DataTypes.TEXT, allowNull: true },
  erroEmissao: { type: DataTypes.TEXT, allowNull: true },
  emitidaEm: { type: DataTypes.DATE, allowNull: true },
})

module.exports = NFe

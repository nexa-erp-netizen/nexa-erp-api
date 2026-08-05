const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ServicoNFSe = sequelize.define("ServicoNFSe", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  codigo: { type: DataTypes.STRING, allowNull: false },
  descricao: { type: DataTypes.STRING, allowNull: false },
  codigoTributacaoNacional: { type: DataTypes.STRING, allowNull: true },
  codigoTributacaoMunicipal: { type: DataTypes.STRING, allowNull: true },
  itemListaServico: { type: DataTypes.STRING, allowNull: true },
  cnae: { type: DataTypes.STRING, allowNull: true },
  aliquotaIss: { type: DataTypes.DECIMAL(7, 4), allowNull: false, defaultValue: 0 },
  valorUnitario: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  issRetido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { indexes: [{ unique: true, fields: ["clienteId", "codigo"] }] })

module.exports = ServicoNFSe

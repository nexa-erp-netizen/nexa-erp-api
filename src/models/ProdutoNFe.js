const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ProdutoNFe = sequelize.define("ProdutoNFe", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  codigo: { type: DataTypes.STRING, allowNull: false },
  descricao: { type: DataTypes.STRING, allowNull: false },
  ncm: { type: DataTypes.STRING, allowNull: false },
  cest: { type: DataTypes.STRING, allowNull: true },
  cfop: { type: DataTypes.STRING, allowNull: false, defaultValue: "5102" },
  unidade: { type: DataTypes.STRING, allowNull: false, defaultValue: "UN" },
  valorUnitario: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  origem: { type: DataTypes.STRING, allowNull: false, defaultValue: "0" },
  csosn: { type: DataTypes.STRING, allowNull: true },
  cstIcms: { type: DataTypes.STRING, allowNull: true },
  cstPis: { type: DataTypes.STRING, allowNull: true },
  cstCofins: { type: DataTypes.STRING, allowNull: true },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { indexes: [{ unique: true, fields: ["clienteId", "codigo"] }] })

module.exports = ProdutoNFe

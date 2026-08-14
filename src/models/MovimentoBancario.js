const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const MovimentoBancario = sequelize.define("MovimentoBancario", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  contaBancariaId: { type: DataTypes.INTEGER, allowNull: false },
  importacaoId: { type: DataTypes.INTEGER, allowNull: false },
  data: { type: DataTypes.DATEONLY, allowNull: false },
  descricao: { type: DataTypes.STRING(500), allowNull: false },
  documento: { type: DataTypes.STRING(100), allowNull: true },
  fitId: { type: DataTypes.STRING(150), allowNull: true },
  tipoBanco: { type: DataTypes.STRING(30), allowNull: true },
  natureza: { type: DataTypes.STRING(10), allowNull: false },
  valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  valorAssinado: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  hashMovimento: { type: DataTypes.STRING(64), allowNull: false },
  statusConciliacao: { type: DataTypes.STRING, allowNull: false, defaultValue: "Pendente" },
  categoriaSugerida: { type: DataTypes.STRING, allowNull: true },
  planoContaId: { type: DataTypes.INTEGER, allowNull: true },
  observacoes: { type: DataTypes.TEXT, allowNull: true },
})

module.exports = MovimentoBancario

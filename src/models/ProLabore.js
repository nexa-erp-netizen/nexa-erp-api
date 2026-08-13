const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ProLabore = sequelize.define("ProLabore", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  socioId: { type: DataTypes.INTEGER, allowNull: false },
  socio: { type: DataTypes.STRING, allowNull: false },
  competencia: { type: DataTypes.STRING(7), allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "Rascunho" },
  valorBruto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  outrosProventos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  outrosDescontos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  pensaoAlimenticia: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  contribuicaoOutrosVinculos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  dependentesIrrf: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  baseInss: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  inss: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  baseIrrf: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  irrf: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  totalProventos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  totalDescontos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  liquido: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  proventos: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  descontos: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  tabelaCalculo: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  observacoes: { type: DataTypes.TEXT, allowNull: true },
  fechadoEm: { type: DataTypes.DATE, allowNull: true },
})

module.exports = ProLabore

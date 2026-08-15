const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const FechamentoConciliacaoBancaria = sequelize.define("FechamentoConciliacaoBancaria", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  contaBancariaId: { type: DataTypes.INTEGER, allowNull: false },
  competencia: { type: DataTypes.STRING(7), allowNull: false },
  saldoInicial: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  totalEntradas: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  totalSaidas: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  saldoFinal: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  quantidadeMovimentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "Fechado" },
  fechadoEm: { type: DataTypes.DATE, allowNull: true },
  fechadoPor: { type: DataTypes.STRING, allowNull: true },
  reabertoEm: { type: DataTypes.DATE, allowNull: true },
  reabertoPor: { type: DataTypes.STRING, allowNull: true },
}, {
  indexes: [{ unique: true, fields: ["escritorioId", "contaBancariaId", "competencia"] }],
})

module.exports = FechamentoConciliacaoBancaria

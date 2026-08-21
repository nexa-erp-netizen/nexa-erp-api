const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const MelhoriaNexa = sequelize.define("MelhoriaNexa", {
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  categoria: { type: DataTypes.STRING(30), allowNull: false },
  titulo: { type: DataTypes.STRING(180), allowNull: false },
  descricao: { type: DataTypes.TEXT, allowNull: false },
  justificativa: { type: DataTypes.TEXT, allowNull: true },
  prioridade: { type: DataTypes.STRING(15), allowNull: false, defaultValue: "Média" },
  impacto: { type: DataTypes.STRING(15), allowNull: false, defaultValue: "Médio" },
  esforco: { type: DataTypes.STRING(15), allowNull: false, defaultValue: "Médio" },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Sugerida" },
  origem: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "conversa" },
  pagina: { type: DataTypes.STRING(120), allowNull: true },
  clienteId: { type: DataTypes.INTEGER, allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: true },
  ultimaAnaliseEm: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: "melhorias_nexa",
  indexes: [
    { fields: ["escritorioId", "fingerprint"] },
    { fields: ["escritorioId", "status", "prioridade"] },
  ],
})

module.exports = MelhoriaNexa

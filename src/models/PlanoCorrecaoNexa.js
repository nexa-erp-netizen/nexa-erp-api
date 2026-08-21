const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const PlanoCorrecaoNexa = sequelize.define("PlanoCorrecaoNexa", {
  incidenteId: { type: DataTypes.INTEGER, allowNull: true },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  titulo: { type: DataTypes.STRING(250), allowNull: false },
  status: { type: DataTypes.STRING(25), allowNull: false, defaultValue: "Proposto" },
  diagnostico: { type: DataTypes.TEXT, allowNull: false },
  causaRaiz: { type: DataTypes.TEXT, allowNull: true },
  escopo: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  etapas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  testesPrevistos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  resultadoTestes: { type: DataTypes.JSONB, allowNull: true },
  rollback: { type: DataTypes.TEXT, allowNull: false },
  risco: { type: DataTypes.STRING(15), allowNull: false, defaultValue: "Médio" },
  exigeConfirmacao: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: true },
  aprovadoEm: { type: DataTypes.DATE, allowNull: true },
  executadoEm: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "planos_correcao_nexa",
  indexes: [
    { fields: ["escritorioId", "status"] },
    { fields: ["escritorioId", "incidenteId"] },
    { fields: ["escritorioId", "fingerprint"] },
  ],
})

module.exports = PlanoCorrecaoNexa

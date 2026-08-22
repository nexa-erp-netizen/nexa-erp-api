const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ExecucaoAgenteNexa = sequelize.define("ExecucaoAgenteNexa", {
  objetivo: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Em andamento" },
  pagina: { type: DataTypes.STRING(120), allowNull: true },
  clienteId: { type: DataTypes.INTEGER, allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: true },
  etapas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  ferramentasUsadas: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  resultado: { type: DataTypes.TEXT, allowNull: true },
  erro: { type: DataTypes.TEXT, allowNull: true },
  iniciadoEm: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  finalizadoEm: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "execucoes_agente_nexa",
  indexes: [
    { fields: ["escritorioId", "createdAt"] },
    { fields: ["escritorioId", "status"] },
  ],
})

module.exports = ExecucaoAgenteNexa

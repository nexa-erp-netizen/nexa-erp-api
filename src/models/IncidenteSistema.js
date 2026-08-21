const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const IncidenteSistema = sequelize.define("IncidenteSistema", {
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  origem: { type: DataTypes.STRING(20), allowNull: false },
  nivel: { type: DataTypes.STRING(15), allowNull: false, defaultValue: "Erro" },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Aberto" },
  titulo: { type: DataTypes.STRING(250), allowNull: false },
  mensagem: { type: DataTypes.TEXT, allowNull: true },
  rota: { type: DataTypes.STRING(500), allowNull: true },
  metodo: { type: DataTypes.STRING(10), allowNull: true },
  statusHttp: { type: DataTypes.INTEGER, allowNull: true },
  componente: { type: DataTypes.STRING(200), allowNull: true },
  contexto: { type: DataTypes.JSONB, allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: true },
  clienteId: { type: DataTypes.INTEGER, allowNull: true },
  versaoWeb: { type: DataTypes.STRING(30), allowNull: true },
  versaoApi: { type: DataTypes.STRING(30), allowNull: true },
  ocorrencias: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  primeiraOcorrenciaEm: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  ultimaOcorrenciaEm: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  diagnostico: { type: DataTypes.TEXT, allowNull: true },
  correcao: { type: DataTypes.TEXT, allowNull: true },
  resolvidoEm: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "incidentes_sistema",
  indexes: [
    { fields: ["escritorioId", "fingerprint", "status"] },
    { fields: ["escritorioId", "ultimaOcorrenciaEm"] },
  ],
})

module.exports = IncidenteSistema

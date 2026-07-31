const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const AuditoriaIntegracaoChatGPT = sequelize.define("AuditoriaIntegracaoChatGPT", {
  ferramenta: { type: DataTypes.STRING, allowNull: false },
  parametros: { type: DataTypes.JSONB, allowNull: true },
  sucesso: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  statusHttp: { type: DataTypes.INTEGER, allowNull: true },
  duracaoMs: { type: DataTypes.INTEGER, allowNull: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: true },
  empresaId: { type: DataTypes.INTEGER, allowNull: true },
  ip: { type: DataTypes.STRING, allowNull: true },
  erro: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: "auditorias_integracao_chatgpt",
  updatedAt: false,
})

module.exports = AuditoriaIntegracaoChatGPT

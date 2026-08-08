const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const WhatsAppAssistEnvio = sequelize.define(
  "WhatsAppAssistEnvio",
  {
    empresaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "empresa_id",
    },
    sugestaoId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "sugestao_id",
    },
    clienteId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "cliente_id",
    },
    cliente: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    modeloId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "modelo_id",
    },
    enviadoPorId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "enviado_por_id",
    },
    enviadoPorNome: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "enviado_por_nome",
    },
    enviadoEm: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "enviado_em",
    },
  },
  {
    tableName: "whatsapp_assist_envios",
    timestamps: true,
    createdAt: "criado_em",
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["empresa_id", "sugestao_id"],
        name: "whatsapp_assist_envios_empresa_sugestao_unique",
      },
    ],
  }
)

module.exports = WhatsAppAssistEnvio

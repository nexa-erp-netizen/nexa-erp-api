const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Notificacao = sequelize.define(
  "Notificacao",
  {
    empresaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "empresa_id",
    },
    clienteId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "cliente_id",
    },
    usuarioId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "usuario_id",
    },
    titulo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mensagem: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lida: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "notificacoes",
    timestamps: true,
    createdAt: "criado_em",
    updatedAt: false,
  }
)

module.exports = Notificacao
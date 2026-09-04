const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const AuditoriaBackup = sequelize.define("AuditoriaBackup", {
  acao: {
    type: DataTypes.STRING(40),
    allowNull: false,
  },
  arquivo: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  origem: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  usuarioEmail: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  checksum: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  backupSeguranca: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  detalhes: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
})

module.exports = AuditoriaBackup

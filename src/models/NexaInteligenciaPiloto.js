const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const NexaInteligenciaPiloto = sequelize.define("NexaInteligenciaPiloto", {
  escritorioId: { type: DataTypes.INTEGER, allowNull: true },
  iniciadoEm: { type: DataTypes.DATE, allowNull: false },
  encerraEm: { type: DataTypes.DATE, allowNull: false },
  limiteUsd: { type: DataTypes.DECIMAL(10, 6), allowNull: false, defaultValue: 10 },
  consumidoUsd: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
  chamadas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  indexes: [{ unique: true, fields: ["escritorioId"] }],
})

module.exports = NexaInteligenciaPiloto

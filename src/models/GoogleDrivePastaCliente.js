const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const GoogleDrivePastaCliente = sequelize.define("GoogleDrivePastaCliente", {
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  pastaDriveId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  pastaDriveNome: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  indexes: [
    { unique: true, fields: ["usuarioId", "clienteId"] },
    { unique: true, fields: ["usuarioId", "pastaDriveId"] },
  ],
})

module.exports = GoogleDrivePastaCliente

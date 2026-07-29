const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const GoogleDriveConexao = sequelize.define("GoogleDriveConexao", {
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  emailGoogle: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  refreshTokenCriptografado: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  pastaRaizId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  pastaRaizNome: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  conectadoEm: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
})

module.exports = GoogleDriveConexao

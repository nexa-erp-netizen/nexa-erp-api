const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Usuario = sequelize.define("Usuario", {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },

  senha: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  perfil: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  clienteVinculado: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
})

module.exports = Usuario
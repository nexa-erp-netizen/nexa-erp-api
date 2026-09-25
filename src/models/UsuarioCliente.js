const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const UsuarioCliente = sequelize.define("UsuarioCliente", {
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  principal: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  indexes: [
    { unique: true, fields: ["escritorioId", "usuarioId", "clienteId"] },
    { fields: ["escritorioId", "usuarioId", "ativo"] },
  ],
})

module.exports = UsuarioCliente

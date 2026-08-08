const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const AcessoCliente = sequelize.define("AcessoCliente", {
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  clienteId: { type: DataTypes.INTEGER, allowNull: true },
  clienteNome: { type: DataTypes.STRING, allowNull: false },
  tipo: { type: DataTypes.STRING, allowNull: false, defaultValue: "atividade" },
  pagina: { type: DataTypes.STRING, allowNull: true },
  recurso: { type: DataTypes.STRING, allowNull: true },
  recursoId: { type: DataTypes.STRING, allowNull: true },
  descricao: { type: DataTypes.STRING, allowNull: true },
  ip: { type: DataTypes.STRING, allowNull: true },
  dispositivo: { type: DataTypes.STRING, allowNull: true },
}, {
  indexes: [
    { fields: ["escritorioId", "clienteId", "createdAt"] },
    { fields: ["escritorioId", "usuarioId", "createdAt"] },
  ],
})

module.exports = AcessoCliente

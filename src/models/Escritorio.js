const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Escritorio = sequelize.define("Escritorio", {
  nome: { type: DataTypes.STRING, allowNull: false },
  codigo: { type: DataTypes.STRING, allowNull: false, unique: true },
  cnpj: { type: DataTypes.STRING, allowNull: true },
  email: { type: DataTypes.STRING, allowNull: true },
  telefone: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "Ativo" },
  plano: { type: DataTypes.STRING, allowNull: false, defaultValue: "Interno" },
}, { semEscritorio: true })

module.exports = Escritorio

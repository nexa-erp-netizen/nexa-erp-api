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
  primeiroAcessoEm: { type: DataTypes.DATE, allowNull: true },
  ultimoAcessoEm: { type: DataTypes.DATE, allowNull: true },
  ultimaAtividadeEm: { type: DataTypes.DATE, allowNull: true },
  totalAcessos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  ultimoAcessoUsuarioNome: { type: DataTypes.STRING, allowNull: true },
  ultimoAcessoIp: { type: DataTypes.STRING(80), allowNull: true },
  ultimoAcessoDispositivo: { type: DataTypes.STRING(160), allowNull: true },
  arquivadoEm: { type: DataTypes.DATE, allowNull: true },
  arquivadoPorUsuarioId: { type: DataTypes.INTEGER, allowNull: true },
}, { semEscritorio: true })

module.exports = Escritorio

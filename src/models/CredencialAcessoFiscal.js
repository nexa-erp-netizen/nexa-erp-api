const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const CredencialAcessoFiscal = sequelize.define("CredencialAcessoFiscal", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  metodo: { type: DataTypes.STRING, allowNull: false },
  identificador: { type: DataTypes.STRING, allowNull: true },
  segredoCriptografado: { type: DataTypes.TEXT, allowNull: true },
  arquivoCriptografado: { type: DataTypes.TEXT, allowNull: true },
  nomeArquivo: { type: DataTypes.STRING, allowNull: true },
  mimeArquivo: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "Configurado" },
  ultimaValidacao: { type: DataTypes.DATE, allowNull: true },
  criadoPor: { type: DataTypes.STRING, allowNull: true },
  atualizadoPor: { type: DataTypes.STRING, allowNull: true },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  indexes: [{ fields: ["clienteId"] }, { fields: ["clienteId", "metodo"] }],
})

module.exports = CredencialAcessoFiscal

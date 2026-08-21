const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const DocumentoAnaliseNexa = sequelize.define("DocumentoAnaliseNexa", {
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  conversaId: { type: DataTypes.INTEGER, allowNull: false },
  clienteId: { type: DataTypes.INTEGER, allowNull: true },
  nomeArquivo: { type: DataTypes.STRING(255), allowNull: false },
  mimeType: { type: DataTypes.STRING(120), allowNull: false },
  hashSha256: { type: DataTypes.STRING(64), allowNull: false },
  textoCriptografado: { type: DataTypes.TEXT, allowNull: false },
  resumo: { type: DataTypes.TEXT, allowNull: false },
  metadados: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
}, {
  indexes: [
    { fields: ["usuarioId", "conversaId", "createdAt"] },
    { fields: ["hashSha256"] },
  ],
})

module.exports = DocumentoAnaliseNexa

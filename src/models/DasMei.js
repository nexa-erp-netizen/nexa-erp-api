const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const DasMei = sequelize.define("DasMei", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  empresaId: { type: DataTypes.INTEGER, allowNull: true },
  cnpj: { type: DataTypes.STRING(14), allowNull: false },
  razaoSocial: { type: DataTypes.STRING, allowNull: true },
  competencia: { type: DataTypes.STRING(7), allowNull: false },
  vencimento: { type: DataTypes.DATEONLY, allowNull: false },
  valor: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  numeroDocumento: { type: DataTypes.STRING, allowNull: true },
  caminhoArquivo: { type: DataTypes.STRING, allowNull: false },
  nomeArquivo: { type: DataTypes.STRING, allowNull: false },
  hashArquivo: { type: DataTypes.STRING(64), allowNull: false },
  dataProgramadaEnvio: { type: DataTypes.DATEONLY, allowNull: true },
  status: {
    type: DataTypes.ENUM("Programada", "Pronta para envio", "Enviada", "Paga"),
    allowNull: false,
    defaultValue: "Programada",
  },
  enviadoEm: { type: DataTypes.DATE, allowNull: true },
  historico: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
}, {
  indexes: [{ unique: true, fields: ["clienteId", "competencia"] }],
})

module.exports = DasMei

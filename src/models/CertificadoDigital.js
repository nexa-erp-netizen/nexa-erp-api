const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const CertificadoDigital = sequelize.define("CertificadoDigital", {
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "A1",
  },
  dataEmissao: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  dataValidade: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  autoridadeCertificadora: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  numeroSerie: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  localArquivo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  tipoLocalizacao: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "Computador",
  },
  caminhoPasta: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  nomeArquivo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  possuiBackup: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  localBackup: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  dataUltimoBackup: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  responsavel: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
})

module.exports = CertificadoDigital

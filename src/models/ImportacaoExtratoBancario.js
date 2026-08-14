const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const ImportacaoExtratoBancario = sequelize.define("ImportacaoExtratoBancario", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  contaBancariaId: { type: DataTypes.INTEGER, allowNull: false },
  nomeArquivo: { type: DataTypes.STRING, allowNull: false },
  formato: { type: DataTypes.STRING(10), allowNull: false },
  hashArquivo: { type: DataTypes.STRING(64), allowNull: false },
  totalLidos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalImportados: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalDuplicados: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalEntradas: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  totalSaidas: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  saldoInformado: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  dataInicio: { type: DataTypes.DATEONLY, allowNull: true },
  dataFim: { type: DataTypes.DATEONLY, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "Importado" },
})

module.exports = ImportacaoExtratoBancario

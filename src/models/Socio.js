const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Socio = sequelize.define("Socio", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  nome: { type: DataTypes.STRING, allowNull: false },
  cpf: { type: DataTypes.STRING, allowNull: false },
  dataNascimento: { type: DataTypes.DATEONLY, allowNull: true },
  nisNitPis: { type: DataTypes.STRING, allowNull: true },
  qualificacao: { type: DataTypes.STRING, allowNull: false, defaultValue: "Sócio-administrador" },
  dataEntrada: { type: DataTypes.DATEONLY, allowNull: true },
  participacaoPercentual: { type: DataTypes.DECIMAL(7, 4), allowNull: true },
  valorProLabore: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  dependentesIrrf: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  contribuicaoOutrosVinculos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  banco: { type: DataTypes.STRING, allowNull: true },
  agencia: { type: DataTypes.STRING, allowNull: true },
  conta: { type: DataTypes.STRING, allowNull: true },
  chavePix: { type: DataTypes.STRING, allowNull: true },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: "Ativo" },
  observacoes: { type: DataTypes.TEXT, allowNull: true },
})

module.exports = Socio

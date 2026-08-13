const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Ferias = sequelize.define("Ferias", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false }, cliente: { type: DataTypes.STRING, allowNull: false },
  funcionarioId: { type: DataTypes.INTEGER, allowNull: false }, funcionario: { type: DataTypes.STRING, allowNull: false },
  periodoAquisitivoInicio: { type: DataTypes.DATEONLY, allowNull: false }, periodoAquisitivoFim: { type: DataTypes.DATEONLY, allowNull: false },
  periodoConcessivoFim: { type: DataTypes.DATEONLY, allowNull: false }, inicioFerias: { type: DataTypes.DATEONLY, allowNull: false }, fimFerias: { type: DataTypes.DATEONLY, allowNull: false },
  diasFerias: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 }, diasAbono: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  faltasInjustificadas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, salarioBase: { type: DataTypes.DECIMAL(12,2), allowNull:false },
  mediaVariaveis: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, adicionaisFixos: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 },
  valorFerias: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, tercoFerias: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 },
  abonoPecuniario: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, tercoAbono: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 },
  adiantamentoDecimo: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, baseInss: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 },
  inss: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, baseIrrf: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, irrf: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 },
  outrosProventos: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, outrosDescontos: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, pensaoAlimenticia: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 },
  totalProventos: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, totalDescontos: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 }, liquido: { type: DataTypes.DECIMAL(12,2), allowNull:false, defaultValue:0 },
  proventos: { type: DataTypes.JSON, allowNull:false, defaultValue:[] }, descontos: { type: DataTypes.JSON, allowNull:false, defaultValue:[] }, tabelaCalculo: { type: DataTypes.JSON, allowNull:false, defaultValue:{} },
  status: { type: DataTypes.STRING, allowNull:false, defaultValue:"Programada" }, observacoes: { type: DataTypes.TEXT, allowNull:true }, fechadoEm: { type: DataTypes.DATE, allowNull:true },
})
module.exports = Ferias

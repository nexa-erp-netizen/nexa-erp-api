const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const MovimentoBancario = sequelize.define("MovimentoBancario", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  cliente: { type: DataTypes.STRING, allowNull: false },
  contaBancariaId: { type: DataTypes.INTEGER, allowNull: false },
  importacaoId: { type: DataTypes.INTEGER, allowNull: false },
  data: { type: DataTypes.DATEONLY, allowNull: false },
  descricao: { type: DataTypes.STRING(500), allowNull: false },
  documento: { type: DataTypes.STRING(100), allowNull: true },
  fitId: { type: DataTypes.STRING(150), allowNull: true },
  tipoBanco: { type: DataTypes.STRING(30), allowNull: true },
  natureza: { type: DataTypes.STRING(10), allowNull: false },
  valor: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  valorAssinado: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  hashMovimento: { type: DataTypes.STRING(64), allowNull: false },
  statusConciliacao: { type: DataTypes.STRING, allowNull: false, defaultValue: "Pendente" },
  categoriaSugerida: { type: DataTypes.STRING, allowNull: true },
  planoContaId: { type: DataTypes.INTEGER, allowNull: true },
  lancamentoContabilId: { type: DataTypes.INTEGER, allowNull: true },
  conciliadoEm: { type: DataTypes.DATE, allowNull: true },
  conciliadoPor: { type: DataTypes.STRING, allowNull: true },
  observacoes: { type: DataTypes.TEXT, allowNull: true },

  // Ajustes reconhecidos manualmente durante a conciliação.
  // ajusteComparacao é SOMENTE o efeito usado para comparar o extrato com
  // Movimentos Clientes; o saldo real do banco continua usando valor/valorAssinado.
  ajusteComparacao: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  ajusteTipo: { type: DataTypes.STRING(40), allowNull: true },
  ajusteMovimentoClienteReferenciaId: { type: DataTypes.INTEGER, allowNull: true },
  ajusteMovimentoClienteGeradoId: { type: DataTypes.INTEGER, allowNull: true },
  ajusteLancamentoContabilGeradoId: { type: DataTypes.INTEGER, allowNull: true },
  ajusteObservacao: { type: DataTypes.TEXT, allowNull: true },
  ajusteStatusAnterior: { type: DataTypes.STRING, allowNull: true },
  ajusteObservacoesAnterior: { type: DataTypes.TEXT, allowNull: true },
  ajustadoEm: { type: DataTypes.DATE, allowNull: true },
  ajustadoPor: { type: DataTypes.STRING, allowNull: true },
  ajusteHistorico: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
})

module.exports = MovimentoBancario

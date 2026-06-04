const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const SolicitacaoCliente = sequelize.define("SolicitacaoCliente", {
  cliente: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  titulo: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  categoria: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  mensagem: {
    type: DataTypes.TEXT,
    allowNull: false,
  },

  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Pendente",
  },

  anexos: {
    type: DataTypes.JSON,
    allowNull: true,
  },

  respostaCliente: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  situacaoCliente: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "Aguardando Pagamento",
  },

  anexoResposta: {
    type: DataTypes.JSON,
    allowNull: true,
  },

  dataResposta: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
})

module.exports = SolicitacaoCliente
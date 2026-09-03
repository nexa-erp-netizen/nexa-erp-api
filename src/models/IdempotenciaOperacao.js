const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const IdempotenciaOperacao = sequelize.define("IdempotenciaOperacao", {
  chaveHash: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: "movimento-cliente",
  },
  resposta: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  expiraEm: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: "idempotencias_operacoes",
  indexes: [
    { unique: true, fields: ["chaveHash"] },
    { fields: ["expiraEm"] },
    { fields: ["escritorioId", "expiraEm"] },
  ],
})

module.exports = IdempotenciaOperacao

const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const HistoricoRegimeTributario = sequelize.define("HistoricoRegimeTributario", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false },
  usuarioId: { type: DataTypes.INTEGER, allowNull: true },
  regimeAnterior: { type: DataTypes.STRING, allowNull: true },
  regimeNovo: { type: DataTypes.STRING, allowNull: false },
  competenciaInicio: { type: DataTypes.STRING(7), allowNull: false },
  dataInicio: { type: DataTypes.DATEONLY, allowNull: false },
  escopo: { type: DataTypes.STRING, allowNull: false, defaultValue: "cadastro-interno" },
  motivo: { type: DataTypes.TEXT, allowNull: true },
  detalhes: { type: DataTypes.JSONB, allowNull: true },
}, {
  tableName: "historicos_regime_tributario",
  indexes: [
    {
      name: "idx_hist_regime_escr_cliente_created",
      fields: ["escritorioId", "clienteId", "createdAt"],
    },
  ],
})

module.exports = HistoricoRegimeTributario

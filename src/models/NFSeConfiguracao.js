const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const NFSeConfiguracao = sequelize.define("NFSeConfiguracao", {
  clienteId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  ambiente: { type: DataTypes.STRING, allowNull: false, defaultValue: "homologacao" },
  serie: { type: DataTypes.STRING, allowNull: false, defaultValue: "1" },
  proximoNumero: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  regimeTributario: { type: DataTypes.STRING, allowNull: true },
  inscricaoMunicipal: { type: DataTypes.STRING, allowNull: true },
  municipioIbge: { type: DataTypes.STRING, allowNull: true },
  optanteSimples: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  incentivadorCultural: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  certificadoDigitalId: { type: DataTypes.INTEGER, allowNull: true },
  provedor: { type: DataTypes.STRING, allowNull: true },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
})

module.exports = NFSeConfiguracao

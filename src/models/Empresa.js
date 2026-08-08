const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Empresa = sequelize.define("Empresa", {
  razao_social: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  nome_fantasia: {
    type: DataTypes.STRING,
  },

  cnpj: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  regime_tributario: {
    type: DataTypes.STRING,
  },

  email: {
    type: DataTypes.STRING,
  },

  telefone: {
    type: DataTypes.STRING,
  },

  endereco: {
    type: DataTypes.STRING,
  },

  status: {
    type: DataTypes.STRING,
    defaultValue: "Ativa",
  },
}, {
  indexes: [{ unique: true, fields: ["escritorioId", "cnpj"] }],
})

module.exports = Empresa

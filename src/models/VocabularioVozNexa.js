const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const VocabularioVozNexa = sequelize.define("VocabularioVozNexa", {
  usuarioId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  clienteId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  termoOuvido: {
    type: DataTypes.STRING(180),
    allowNull: false,
  },
  termoCorreto: {
    type: DataTypes.STRING(180),
    allowNull: false,
  },
  termoOuvidoNormalizado: {
    type: DataTypes.STRING(180),
    allowNull: false,
  },
  origem: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: "confirmacao_voz",
  },
  confirmada: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  ativa: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  usos: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  ultimoUsoEm: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["usuarioId", "termoOuvidoNormalizado"],
      name: "vocabulario_voz_usuario_termo_unico",
    },
  ],
})

module.exports = VocabularioVozNexa

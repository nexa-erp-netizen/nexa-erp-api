const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Cliente = sequelize.define("Cliente", {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  cpf: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  telefone: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  email: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  cnpj: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  dataNascimento: {
  type: DataTypes.DATEONLY,
  allowNull: true,
},

senhaGovBr: {
  type: DataTypes.STRING,
  allowNull: true,
},

tituloEleitor: {
  type: DataTypes.STRING,
  allowNull: true,
},

codigoSimplesNacional: {
  type: DataTypes.STRING,
  allowNull: true,
},

cnaePrincipal: {
  type: DataTypes.STRING,
  allowNull: true,
},

inscricaoMunicipal: {
  type: DataTypes.STRING,
  allowNull: true,
},

inscricaoEstadual: {
  type: DataTypes.STRING,
  allowNull: true,
},

alvara: {
  type: DataTypes.STRING,
  allowNull: true,
},

  regime: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  cep: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  endereco: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  numero: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  bairro: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  complemento: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  cidade: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  estado: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  observacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  anexos: {
    type: DataTypes.JSON,
    allowNull: true,
  },

  anotacoes: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },

  empresaId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
})

module.exports = Cliente
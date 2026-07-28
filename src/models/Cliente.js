const { DataTypes } = require("sequelize")
const sequelize = require("../config/database")

const Cliente = sequelize.define("Cliente", {
  nome: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  ativo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
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

  ramoAtividade: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  anexoSimples: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  utilizaFatorR: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  aliquotaIss: {
    type: DataTypes.DECIMAL(7, 4),
    allowNull: true,
  },

  dataOpcaoRegime: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },

  dataInicioAtividades: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },

  situacaoEmpresa: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "Ativa",
  },

  observacoesTributarias: {
    type: DataTypes.TEXT,
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

  proximasAcoes: {
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

const { Sequelize } = require("sequelize")
const { AsyncLocalStorage } = require("async_hooks")

const contextoEscritorio = new AsyncLocalStorage()

let sequelize

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres",
    protocol: "postgres",
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  })
} else {
  sequelize = new Sequelize(
    "nexa_erp",
    "postgres",
    "Nexa123@",
    {
      host: "localhost",
      dialect: "postgres",
      port: 5432,
      logging: false,
    }
  )
}

const definirOriginal = sequelize.define.bind(sequelize)

sequelize.define = (nome, atributos = {}, opcoes = {}) => {
  const semEscritorio = opcoes.semEscritorio === true || nome === "Escritorio"
  const opcoesLimpas = { ...opcoes }
  delete opcoesLimpas.semEscritorio

  if (!semEscritorio && !atributos.escritorioId) {
    atributos = {
      ...atributos,
      escritorioId: {
        type: Sequelize.DataTypes.INTEGER,
        allowNull: true,
      },
    }
  }

  return definirOriginal(nome, atributos, opcoesLimpas)
}

function escritorioAtual() {
  return contextoEscritorio.getStore()?.escritorioId || null
}

function aplicarFiltroEscritorio(modelo, opcoes = {}) {
  const escritorioId = escritorioAtual()
  if (!escritorioId || !modelo?.rawAttributes?.escritorioId || opcoes.semIsolamentoEscritorio) return
  opcoes.where = { ...(opcoes.where || {}), escritorioId }
}

sequelize.addHook("beforeFind", function (opcoes) {
  aplicarFiltroEscritorio(this, opcoes)
})

sequelize.addHook("beforeCount", function (opcoes) {
  aplicarFiltroEscritorio(this, opcoes)
})

sequelize.addHook("beforeCreate", function (registro, opcoes) {
  const escritorioId = escritorioAtual()
  if (escritorioId && registro.constructor?.rawAttributes?.escritorioId && !opcoes.semIsolamentoEscritorio) {
    registro.escritorioId = escritorioId
  }
})

sequelize.addHook("beforeBulkCreate", function (registros, opcoes) {
  const escritorioId = escritorioAtual()
  if (!escritorioId || opcoes.semIsolamentoEscritorio) return
  registros.forEach((registro) => {
    if (registro.constructor?.rawAttributes?.escritorioId) registro.escritorioId = escritorioId
  })
})

for (const evento of ["beforeUpdate", "beforeDestroy", "beforeBulkUpdate", "beforeBulkDestroy"]) {
  sequelize.addHook(evento, function (registroOuOpcoes, talvezOpcoes) {
    const opcoes = talvezOpcoes || registroOuOpcoes
    aplicarFiltroEscritorio(this, opcoes)
  })
}

sequelize.contextoEscritorio = contextoEscritorio

module.exports = sequelize

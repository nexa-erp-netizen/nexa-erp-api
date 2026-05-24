const { Sequelize } = require("sequelize")

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

module.exports = sequelize
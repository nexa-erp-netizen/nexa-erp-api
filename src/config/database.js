const { Sequelize } = require("sequelize")

const sequelize = new Sequelize(
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

module.exports = sequelize
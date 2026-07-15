const express = require("express")
const { autenticar } = require("../middlewares/authMiddleware")
const { conversar } = require("../controllers/conversaController")

const router = express.Router()
router.post("/", autenticar, conversar)
module.exports = router

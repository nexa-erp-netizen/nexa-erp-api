const sequelize = require("../config/database")

function contextoDoEscritorio(req, res, next) {
  const escritorioId = Number(req.usuario?.escritorioId)

  if (!Number.isInteger(escritorioId) || escritorioId <= 0) {
    return res.status(403).json({
      message: "Usuário sem escritório vinculado. Entre novamente ou contate o administrador da plataforma.",
    })
  }

  sequelize.contextoEscritorio.run({ escritorioId }, next)
}

module.exports = { contextoDoEscritorio }

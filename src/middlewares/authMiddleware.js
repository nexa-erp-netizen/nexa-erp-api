const jwt = require("jsonwebtoken")

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não configurado")
}

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return res.status(401).json({
      message: "Token não informado",
    })
  }

  const [, token] = authHeader.split(" ")

  if (!token) {
    return res.status(401).json({
      message: "Token inválido",
    })
  }

  try {
    const usuario = jwt.verify(token, JWT_SECRET)

    req.usuario = usuario

    next()
  } catch (error) {
    return res.status(401).json({
      message: "Token expirado ou inválido",
    })
  }
}

function autorizarPerfis(...perfisPermitidos) {
  return (req, res, next) => {
    if (
      !req.usuario ||
      !perfisPermitidos.includes(req.usuario.perfil)
    ) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    next()
  }
}

module.exports = {
  autenticar,
  autorizarPerfis,
}
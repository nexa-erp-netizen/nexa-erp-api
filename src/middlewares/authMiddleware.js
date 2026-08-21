const jwt = require("jsonwebtoken")
const Usuario = require("../models/Usuario")
const Cliente = require("../models/Cliente")

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não configurado")
}

async function autenticar(req, res, next) {
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

    const usuarioAtual = await Usuario.findByPk(usuario.id, {
      attributes: ["id", "ativo", "perfil", "clienteVinculado", "escritorioId"],
      semIsolamentoEscritorio: true,
    })

    if (!usuarioAtual || usuarioAtual.ativo === false) {
      if (usuarioAtual?.perfil === "Cliente" && usuarioAtual.clienteVinculado) {
        const clienteBloqueado = await Cliente.findOne({
          where: {
            nome: usuarioAtual.clienteVinculado,
            escritorioId: usuarioAtual.escritorioId,
            portalBloqueado: true,
          },
          semIsolamentoEscritorio: true,
        })
        if (clienteBloqueado) {
          return res.status(403).json({
            message: "Seu acesso ao Portal está temporariamente bloqueado. Entre em contato com o escritório para regularização.",
            portalBloqueado: true,
          })
        }
      }
      return res.status(403).json({
        message: "Este acesso está bloqueado. Procure o administrador do escritório.",
      })
    }

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
    const normalizarPerfil = (valor) => String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()

    const perfilAtual = normalizarPerfil(req.usuario?.perfil)
    const permitidos = perfisPermitidos.map(normalizarPerfil)

    if (
      !req.usuario ||
      !permitidos.includes(perfilAtual)
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

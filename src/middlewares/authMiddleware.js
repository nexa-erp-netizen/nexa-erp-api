const jwt = require("jsonwebtoken")
const Usuario = require("../models/Usuario")
const Cliente = require("../models/Cliente")
const Escritorio = require("../models/Escritorio")
const { registrarAtividadeEscritorio } = require("../services/acessoEscritorioService")

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
      attributes: ["id", "nome", "email", "ativo", "perfil", "clienteVinculado", "escritorioId", "plataformaAdmin", "arquivadoEm"],
      semIsolamentoEscritorio: true,
    })

    if (!usuarioAtual || usuarioAtual.ativo === false || usuarioAtual.arquivadoEm) {
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

    let escritorioAtual = null
    if (usuarioAtual.escritorioId) {
      escritorioAtual = await Escritorio.findByPk(usuarioAtual.escritorioId, { semIsolamentoEscritorio: true })
    }
    if (!usuarioAtual.plataformaAdmin && usuarioAtual.escritorioId) {
      const escritorio = escritorioAtual
      if (!escritorio || escritorio.arquivadoEm || escritorio.status === "Arquivado") {
        return res.status(403).json({ message: "Este escritório está arquivado. Entre em contato com a administração da plataforma." })
      }
    }

    req.usuario = {
      ...usuario,
      perfil: usuarioAtual.perfil,
      clienteVinculado: usuarioAtual.clienteVinculado,
      escritorioId: usuarioAtual.escritorioId,
      plataformaAdmin: usuarioAtual.plataformaAdmin === true,
    }

    await registrarAtividadeEscritorio(escritorioAtual, usuarioAtual, req)

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

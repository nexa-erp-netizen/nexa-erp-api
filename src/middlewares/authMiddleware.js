const jwt = require("jsonwebtoken")
const Usuario = require("../models/Usuario")
const Escritorio = require("../models/Escritorio")
const { registrarAtividadeEscritorio } = require("../services/acessoEscritorioService")
const {
  clientesVinculadosAoUsuario,
  escolherClienteAtivo,
} = require("../services/usuarioClienteService")

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

    let clienteAtivo = null
    let clientesVinculados = []
    if (usuarioAtual.perfil === "Cliente") {
      clientesVinculados = await clientesVinculadosAoUsuario(usuarioAtual)
      clienteAtivo = escolherClienteAtivo(clientesVinculados, usuario.clienteId)
      if (!clienteAtivo) {
        return res.status(403).json({ message: "Este acesso não possui empresa vinculada. Procure o escritório." })
      }
      if (clienteAtivo.portalBloqueado) {
        return res.status(403).json({
          message: "O Portal desta empresa está temporariamente bloqueado. Entre em contato com o escritório para regularização.",
          portalBloqueado: true,
        })
      }
    }

    req.usuario = {
      ...usuario,
      perfil: usuarioAtual.perfil,
      clienteId: clienteAtivo?.id || null,
      clienteVinculado: clienteAtivo?.nome || usuarioAtual.clienteVinculado,
      clientesVinculados,
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

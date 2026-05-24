function filtroEmpresa(req) {
  if (!req.usuario) return {}

  if (req.usuario.perfil === "Administrador") {
    return {}
  }

  return {
    empresaId: req.usuario.empresaId,
  }
}

module.exports = filtroEmpresa
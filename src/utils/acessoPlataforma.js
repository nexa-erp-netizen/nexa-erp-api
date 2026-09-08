function ehAdministradorPlataforma(usuario) {
  return usuario?.perfil === "Administrador" && usuario?.plataformaAdmin === true
}

function registrarTentativaTecnicaBloqueada(usuario, recurso = "recurso-tecnico") {
  console.warn("NEXA ACESSO TÉCNICO BLOQUEADO", {
    recurso: String(recurso).slice(0, 80),
    usuarioId: Number(usuario?.id) || null,
    escritorioId: Number(usuario?.escritorioId) || null,
    perfil: String(usuario?.perfil || "desconhecido").slice(0, 40),
    em: new Date().toISOString(),
  })
}

function exigirAdministradorPlataforma(req, res, next) {
  if (ehAdministradorPlataforma(req.usuario)) return next()
  registrarTentativaTecnicaBloqueada(req.usuario, `${req.method || ""} ${req.originalUrl || req.path || ""}`.trim())
  return res.status(403).json({ message: "Acesso exclusivo do administrador da plataforma." })
}

module.exports = { ehAdministradorPlataforma, exigirAdministradorPlataforma, registrarTentativaTecnicaBloqueada }

const sequelize = require("../config/database")

function ipDaRequisicao(req) {
  return String(req?.headers?.["x-forwarded-for"] || req?.ip || "")
    .split(",")[0]
    .trim()
    .slice(0, 80)
}

function resumirDispositivo(req) {
  const agente = String(req?.headers?.["user-agent"] || "").slice(0, 500)
  const sistema = /Windows/i.test(agente) ? "Windows"
    : /Android/i.test(agente) ? "Android"
      : /iPhone|iPad/i.test(agente) ? "iOS"
        : /Mac OS/i.test(agente) ? "macOS"
          : /Linux/i.test(agente) ? "Linux" : "Dispositivo não identificado"
  const navegador = /Edg\//i.test(agente) ? "Edge"
    : /Chrome\//i.test(agente) ? "Chrome"
      : /Firefox\//i.test(agente) ? "Firefox"
        : /Safari\//i.test(agente) ? "Safari" : "Navegador não identificado"
  return `${sistema} • ${navegador}`.slice(0, 160)
}

async function registrarLoginEscritorio(escritorio, usuario, req) {
  if (!escritorio) return
  const agora = new Date()
  await escritorio.update({
    primeiroAcessoEm: escritorio.primeiroAcessoEm || agora,
    ultimoAcessoEm: agora,
    ultimaAtividadeEm: agora,
    totalAcessos: sequelize.literal('COALESCE("totalAcessos", 0) + 1'),
    ultimoAcessoUsuarioNome: String(usuario?.nome || usuario?.email || "Usuário").slice(0, 255),
    ultimoAcessoIp: ipDaRequisicao(req) || null,
    ultimoAcessoDispositivo: resumirDispositivo(req),
  }, { semIsolamentoEscritorio: true })
}

async function registrarAtividadeEscritorio(escritorio, usuario, req) {
  if (!escritorio) return
  const ultima = escritorio.ultimaAtividadeEm ? new Date(escritorio.ultimaAtividadeEm).getTime() : 0
  if (Date.now() - ultima < 60000) return
  await escritorio.update({
    ultimaAtividadeEm: new Date(),
    ultimoAcessoUsuarioNome: String(usuario?.nome || usuario?.email || "Usuário").slice(0, 255),
    ultimoAcessoIp: ipDaRequisicao(req) || null,
    ultimoAcessoDispositivo: resumirDispositivo(req),
  }, { semIsolamentoEscritorio: true })
}

module.exports = { ipDaRequisicao, resumirDispositivo, registrarLoginEscritorio, registrarAtividadeEscritorio }

const express = require("express")
const router = express.Router()

const Notificacao = require("../models/Notificacao")
const { autenticar } = require("../middlewares/authMiddleware")

router.get("/ping", (req, res) => {
  res.json({ ok: true, rota: "notificacoes funcionando" })
})

function somenteEquipe(req, res, next) {
  if (!["Administrador", "Funcionário"].includes(req.usuario.perfil)) {
    return res.status(403).json({ erro: "Acesso negado" })
  }

  next()
}

router.get("/", autenticar, somenteEquipe, async (req, res) => {
  try {
    const notificacoes = await Notificacao.listar(req.usuario.empresaId)
    res.json(notificacoes)
  } catch (error) {
    console.error("Erro ao listar notificações:", error)
    res.status(500).json({ erro: "Erro ao listar notificações" })
  }
})

router.get("/contador", autenticar, somenteEquipe, async (req, res) => {
  try {
    const total = await Notificacao.contarNaoLidas(req.usuario.empresaId)
    res.json({ total })
  } catch (error) {
    console.error("Erro ao contar notificações:", error)
    res.status(500).json({ erro: "Erro ao contar notificações" })
  }
})

router.patch("/:id/lida", autenticar, somenteEquipe, async (req, res) => {
  try {
    const notificacao = await Notificacao.marcarComoLida(
      req.params.id,
      req.usuario.empresaId
    )

    res.json(notificacao)
  } catch (error) {
    console.error("Erro ao marcar notificação como lida:", error)
    res.status(500).json({ erro: "Erro ao marcar notificação como lida" })
  }
})

router.patch("/marcar-todas/lidas", autenticar, somenteEquipe, async (req, res) => {
  try {
    await Notificacao.marcarTodasComoLidas(req.usuario.empresaId)
    res.json({ mensagem: "Todas as notificações foram marcadas como lidas" })
  } catch (error) {
    console.error("Erro ao marcar todas como lidas:", error)
    res.status(500).json({ erro: "Erro ao marcar todas como lidas" })
  }
})

module.exports = router
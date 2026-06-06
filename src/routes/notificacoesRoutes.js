const express = require("express")
const router = express.Router()

const Notificacao = require("../models/Notificacao")
const { autenticar } = require("../middlewares/authMiddleware")

function somenteEquipe(req, res, next) {
  if (!["Administrador", "Funcionário"].includes(req.usuario.perfil)) {
    return res.status(403).json({ erro: "Acesso negado" })
  }

  next()
}

router.get("/ping", (req, res) => {
  res.json({ ok: true, rota: "notificacoes funcionando" })
})

router.get("/", autenticar, somenteEquipe, async (req, res) => {
  try {
    const notificacoes = await Notificacao.findAll({
      where: { empresaId: req.usuario.empresaId },
      order: [["criado_em", "DESC"]],
    })

    res.json(notificacoes)
  } catch (error) {
    console.error("Erro ao listar notificações:", error)
    res.status(500).json({ erro: "Erro ao listar notificações" })
  }
})

router.get("/teste", async (req, res) => {
  try {
    const notificacao = await Notificacao.create({
      empresaId: 1,
      titulo: "Teste de Notificação",
      tipo: "teste",
      mensagem: "Notificação criada com sucesso"
    })

    res.json(notificacao)
  } catch (error) {
    console.error(error)
    res.status(500).json({ erro: error.message })
  }
})

router.get("/contador", autenticar, somenteEquipe, async (req, res) => {
  try {
    const total = await Notificacao.count({
      where: {
        empresaId: req.usuario.empresaId,
        lida: false,
      },
    })

    res.json({ total })
  } catch (error) {
    console.error("Erro ao contar notificações:", error)
    res.status(500).json({ erro: "Erro ao contar notificações" })
  }
})

router.patch("/:id/lida", autenticar, somenteEquipe, async (req, res) => {
  try {
    const [atualizadas] = await Notificacao.update(
      { lida: true },
      {
        where: {
          id: req.params.id,
          empresaId: req.usuario.empresaId,
        },
      }
    )

    res.json({ sucesso: atualizadas > 0 })
  } catch (error) {
    console.error("Erro ao marcar notificação como lida:", error)
    res.status(500).json({ erro: "Erro ao marcar notificação como lida" })
  }
})

router.patch("/marcar-todas/lidas", autenticar, somenteEquipe, async (req, res) => {
  try {
    await Notificacao.update(
      { lida: true },
      {
        where: {
          empresaId: req.usuario.empresaId,
          lida: false,
        },
      }
    )

    res.json({ mensagem: "Todas as notificações foram marcadas como lidas" })
  } catch (error) {
    console.error("Erro ao marcar todas como lidas:", error)
    res.status(500).json({ erro: "Erro ao marcar todas como lidas" })
  }
})

module.exports = router
const express = require("express")
const router = express.Router()
const WhatsAppAssistEnvio = require("../models/WhatsAppAssistEnvio")
const { autenticar, autorizarPerfis } = require("../middlewares/authMiddleware")

const somenteEquipe = autorizarPerfis("Administrador", "Funcionário")

router.get("/envios", autenticar, somenteEquipe, async (req, res) => {
  try {
    const envios = await WhatsAppAssistEnvio.findAll({
      where: { empresaId: req.usuario.empresaId },
      attributes: ["sugestaoId", "cliente", "modeloId", "enviadoPorNome", "enviadoEm"],
      order: [["enviadoEm", "DESC"]],
    })

    res.json(envios)
  } catch (error) {
    console.error("Erro ao listar envios do Nexa Assist WhatsApp:", error)
    res.status(500).json({ erro: "Erro ao consultar mensagens já enviadas" })
  }
})

router.post("/envios", autenticar, somenteEquipe, async (req, res) => {
  try {
    const sugestaoId = String(req.body?.sugestaoId || "").trim()
    const cliente = String(req.body?.cliente || "").trim()

    if (!sugestaoId || !cliente) {
      return res.status(400).json({ erro: "Sugestão e cliente são obrigatórios" })
    }

    const [envio, criado] = await WhatsAppAssistEnvio.findOrCreate({
      where: {
        empresaId: req.usuario.empresaId,
        sugestaoId,
      },
      defaults: {
        empresaId: req.usuario.empresaId,
        sugestaoId,
        clienteId: req.body?.clienteId || null,
        cliente,
        modeloId: req.body?.modeloId || null,
        enviadoPorId: req.usuario.id || null,
        enviadoPorNome: req.usuario.nome || req.usuario.email || "Equipe Nexa",
        enviadoEm: new Date(),
      },
    })

    res.status(criado ? 201 : 200).json(envio)
  } catch (error) {
    console.error("Erro ao confirmar envio do Nexa Assist WhatsApp:", error)
    res.status(500).json({ erro: "Erro ao confirmar o envio da mensagem" })
  }
})

module.exports = router

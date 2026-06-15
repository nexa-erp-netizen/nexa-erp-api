const express = require("express")
const Agenda = require("../models/Agenda")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

function somenteEquipe(req, res, next) {
  if (!["Administrador", "Funcionário"].includes(req.usuario.perfil)) {
    return res.status(403).json({ message: "Acesso negado" })
  }

  next()
}

router.use(autenticar)
router.use(somenteEquipe)

router.get("/", async (req, res) => {
  try {
    const eventos = await Agenda.findAll({
      order: [["data", "ASC"]],
    })

    res.json(eventos)
  } catch (error) {
    console.error("ERRO AO LISTAR AGENDA:", error)

    res.status(500).json({
      message: "Erro ao listar agenda",
    })
  }
})

router.post("/", async (req, res) => {
  try {
    const novoEvento = await Agenda.create(req.body)

    res.status(201).json(novoEvento)
  } catch (error) {
    console.error("ERRO AO CRIAR EVENTO:", error)

    res.status(500).json({
      message: "Erro ao criar evento",
    })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const evento = await Agenda.findByPk(id)

    if (!evento) {
      return res.status(404).json({
        message: "Evento não encontrado",
      })
    }

    await evento.destroy()

    res.json({
      message: "Evento excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR EVENTO:", error)

    res.status(500).json({
      message: "Erro ao excluir evento",
    })
  }
})

module.exports = router

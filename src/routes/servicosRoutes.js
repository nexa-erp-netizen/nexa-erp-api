const express = require("express")
const Servico = require("../models/Servico")

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
    const servicos = await Servico.findAll({
      order: [["createdAt", "DESC"]],
    })

    res.json(servicos)
  } catch (error) {
    console.error("ERRO AO LISTAR SERVIÇOS:", error)

    res.status(500).json({
      message: "Erro ao listar serviços",
    })
  }
})

router.post("/", async (req, res) => {
  try {
    const novoServico = await Servico.create(req.body)

    res.status(201).json(novoServico)
  } catch (error) {
    console.error("ERRO AO CRIAR SERVIÇO:", error)

    res.status(500).json({
      message: "Erro ao criar serviço",
    })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const servico = await Servico.findByPk(id)

    if (!servico) {
      return res.status(404).json({
        message: "Serviço não encontrado",
      })
    }

    await servico.update(req.body)

    res.json(servico)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR SERVIÇO:", error)

    res.status(500).json({
      message: "Erro ao atualizar serviço",
    })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const servico = await Servico.findByPk(id)

    if (!servico) {
      return res.status(404).json({
        message: "Serviço não encontrado",
      })
    }

    await servico.destroy()

    res.json({
      message: "Serviço excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR SERVIÇO:", error)

    res.status(500).json({
      message: "Erro ao excluir serviço",
    })
  }
})

module.exports = router
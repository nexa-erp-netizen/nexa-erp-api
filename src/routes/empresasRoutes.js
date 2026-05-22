const express = require("express")
const Empresa = require("../models/Empresa")

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const empresas = await Empresa.findAll({
      order: [["createdAt", "DESC"]],
    })

    res.json(empresas)
  } catch (error) {
    console.error("ERRO AO LISTAR EMPRESAS:", error)

    res.status(500).json({
      message: "Erro ao listar empresas",
    })
  }
})

router.post("/", async (req, res) => {
  try {
    const novaEmpresa = await Empresa.create(req.body)

    res.status(201).json(novaEmpresa)
  } catch (error) {
    console.error("ERRO AO CRIAR EMPRESA:", error)

    res.status(500).json({
      message: "Erro ao criar empresa",
    })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const empresa = await Empresa.findByPk(req.params.id)

    if (!empresa) {
      return res.status(404).json({
        message: "Empresa não encontrada",
      })
    }

    await empresa.update(req.body)

    res.json(empresa)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR EMPRESA:", error)

    res.status(500).json({
      message: "Erro ao atualizar empresa",
    })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const empresa = await Empresa.findByPk(req.params.id)

    if (!empresa) {
      return res.status(404).json({
        message: "Empresa não encontrada",
      })
    }

    await empresa.destroy()

    res.json({
      message: "Empresa excluída com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR EMPRESA:", error)

    res.status(500).json({
      message: "Erro ao excluir empresa",
    })
  }
})

module.exports = router
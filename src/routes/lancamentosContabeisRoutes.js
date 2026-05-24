const express = require("express")

const LancamentoContabil = require("../models/LancamentoContabil")
const Financeiro = require("../models/Financeiro")
const upload = require("../middlewares/upload")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      where.cliente = req.usuario.clienteVinculado
    }

    if (req.usuario.empresaId) {
      where.empresaId = req.usuario.empresaId
    }

    const lancamentos = await LancamentoContabil.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(lancamentos)
  } catch (error) {
    console.error("ERRO AO LISTAR LANÇAMENTOS:", error)

    res.status(500).json({
      message: "Erro ao listar lançamentos",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    const novoLancamento = await LancamentoContabil.create({
      ...req.body,
      empresaId: req.usuario?.empresaId || null,
    })

    await Financeiro.create({
      descricao: req.body.descricao || "Honorários",
      cliente: req.body.cliente,
      tipo: "Receber",
      valor: req.body.valor,
      vencimento: req.body.data,
      status: "Pendente",
      anexos: req.body.anexos || [],
      empresaId: req.usuario?.empresaId || null,
    })

    res.status(201).json(novoLancamento)
  } catch (error) {
    console.error("ERRO AO CRIAR LANÇAMENTO:", error)

    res.status(500).json({
      message: "Erro ao criar lançamento",
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    const lancamento = await LancamentoContabil.findByPk(req.params.id)

    if (!lancamento) {
      return res.status(404).json({
        message: "Lançamento não encontrado",
      })
    }

    await lancamento.update(req.body)

    res.json(lancamento)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR LANÇAMENTO:", error)

    res.status(500).json({
      message: "Erro ao atualizar lançamento",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    const lancamento = await LancamentoContabil.findByPk(req.params.id)

    if (!lancamento) {
      return res.status(404).json({
        message: "Lançamento não encontrado",
      })
    }

    await lancamento.destroy()

    res.json({
      message: "Lançamento excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR LANÇAMENTO:", error)

    res.status(500).json({
      message: "Erro ao excluir lançamento",
    })
  }
})

router.post(
  "/upload",
  autenticar,
  upload.array("arquivos"),
  async (req, res) => {
    try {
      const arquivos = req.files.map((file) => ({
        nome: file.originalname,
        caminho: `/uploads/${file.filename}`,
      }))

      res.json(arquivos)
    } catch (error) {
      console.error("ERRO NO UPLOAD CONTÁBIL:", error)

      res.status(500).json({
        message: "Erro ao fazer upload contábil",
      })
    }
  }
)

module.exports = router
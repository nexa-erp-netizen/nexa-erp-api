const express = require("express")
const Financeiro = require("../models/Financeiro")
const upload = require("../middlewares/upload")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

// LISTAR FINANCEIRO
router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      if (req.usuario.clienteVinculado) {
        where.cliente = req.usuario.clienteVinculado
      } else {
        return res.json([])
      }
    }

    if (req.usuario.empresaId) {
      where.empresaId = req.usuario.empresaId
    }

    const lancamentos = await Financeiro.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(lancamentos)
  } catch (error) {
    console.error("ERRO AO LISTAR FINANCEIRO:", error)

    res.status(500).json({
      message: "Erro ao listar financeiro",
    })
  }
})

// CRIAR LANÇAMENTO
router.post("/", autenticar, async (req, res) => {
  try {
    const novoLancamento = await Financeiro.create({
      ...req.body,
      empresaId:
        req.usuario?.empresaId ||
        req.body.empresaId ||
        null,
    })

    res.status(201).json(novoLancamento)
  } catch (error) {
    console.error("ERRO AO CRIAR FINANCEIRO:", error)

    res.status(500).json({
      message: "Erro ao criar lançamento",
      error,
    })
  }
})

// ATUALIZAR / MARCAR COMO PAGO
router.put("/:id", autenticar, async (req, res) => {
  try {
    const lancamento = await Financeiro.findByPk(
      req.params.id
    )

    if (!lancamento) {
      return res.status(404).json({
        message: "Lançamento financeiro não encontrado",
      })
    }

    if (
      req.usuario.empresaId &&
      lancamento.empresaId !== req.usuario.empresaId
    ) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    await lancamento.update(req.body)

    res.json(lancamento)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR FINANCEIRO:", error)

    res.status(500).json({
      message: "Erro ao atualizar lançamento",
      error,
    })
  }
})

// EXCLUIR LANÇAMENTO
router.delete("/:id", autenticar, async (req, res) => {
  try {
    const lancamento = await Financeiro.findByPk(
      req.params.id
    )

    if (!lancamento) {
      return res.status(404).json({
        message: "Lançamento financeiro não encontrado",
      })
    }

    if (
      req.usuario.empresaId &&
      lancamento.empresaId !== req.usuario.empresaId
    ) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    await lancamento.destroy()

    res.json({
      message: "Lançamento financeiro excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR FINANCEIRO:", error)

    res.status(500).json({
      message: "Erro ao excluir lançamento",
      error,
    })
  }
})

// UPLOAD DE ANEXOS
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
      console.error("ERRO AO ENVIAR ANEXO FINANCEIRO:", error)

      res.status(500).json({
        message: "Erro ao enviar anexo financeiro",
      })
    }
  }
)

module.exports = router
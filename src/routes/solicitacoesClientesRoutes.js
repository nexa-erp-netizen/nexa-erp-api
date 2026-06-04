const express = require("express")
const upload = require("../middlewares/upload")

const SolicitacaoCliente = require("../models/SolicitacaoCliente")

const router = express.Router()

const {
  autenticar,
} = require("../middlewares/authMiddleware")

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

    const solicitacoes =
      await SolicitacaoCliente.findAll({
        where,
        order: [["createdAt", "DESC"]],
      })

    res.json(solicitacoes)
  } catch (error) {
    console.error(
      "ERRO AO LISTAR SOLICITAÇÕES:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao listar solicitações",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    const novaSolicitacao =
      await SolicitacaoCliente.create({
        ...req.body,
        empresaId:
          req.usuario?.empresaId || null,
      })

    res.status(201).json(
      novaSolicitacao
    )
  } catch (error) {
    console.error(
      "ERRO AO CRIAR SOLICITAÇÃO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao criar solicitação",
    })
  }
})
router.put("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const solicitacao =
      await SolicitacaoCliente.findByPk(id)

    if (!solicitacao) {
      return res.status(404).json({
        message:
          "Solicitação não encontrada",
      })
    }

    await solicitacao.update(req.body)

    res.json(solicitacao)
  } catch (error) {
    console.error(
      "ERRO AO ATUALIZAR SOLICITAÇÃO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao atualizar solicitação",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const solicitacao =
      await SolicitacaoCliente.findByPk(id)

    if (!solicitacao) {
      return res.status(404).json({
        message:
          "Solicitação não encontrada",
      })
    }

    await solicitacao.destroy()

    res.json({
      message:
        "Solicitação excluída com sucesso",
    })
  } catch (error) {
    console.error(
      "ERRO AO EXCLUIR SOLICITAÇÃO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao excluir solicitação",
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
      console.error(
        "ERRO NO UPLOAD PORTAL CLIENTE:",
        error
      )

      res.status(500).json({
        message:
          "Erro ao fazer upload",
      })
    }
  }
)

module.exports = router
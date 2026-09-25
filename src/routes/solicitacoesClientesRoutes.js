const express = require("express")
const upload = require("../middlewares/upload")

const SolicitacaoCliente = require("../models/SolicitacaoCliente")
const Cliente = require("../models/Cliente")
const { resolverClienteFinanceiro } = require("../services/clienteFinanceiroService")

const router = express.Router()

const {
  autenticar,
} = require("../middlewares/authMiddleware")

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      if (req.usuario.clienteId) {
        where.clienteId = req.usuario.clienteId
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
    const cliente = req.usuario.perfil === "Cliente"
      ? await Cliente.findByPk(req.usuario.clienteId)
      : await resolverClienteFinanceiro({ clienteId: req.body.clienteId, cliente: req.body.cliente })
    if (!cliente) return res.status(400).json({ message: "Selecione um cliente válido" })

    const novaSolicitacao =
      await SolicitacaoCliente.create({
        ...req.body,
        clienteId: cliente.id,
        cliente: cliente.nome,
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

    if (req.usuario.perfil === "Cliente" && Number(solicitacao.clienteId) !== Number(req.usuario.clienteId)) {
      return res.status(403).json({ message: "Acesso não autorizado" })
    }

    const dados = req.usuario.perfil === "Cliente"
      ? { ...req.body, clienteId: solicitacao.clienteId, cliente: solicitacao.cliente }
      : req.body
    await solicitacao.update(dados)

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
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({ message: "Cliente não pode excluir solicitações" })
    }
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

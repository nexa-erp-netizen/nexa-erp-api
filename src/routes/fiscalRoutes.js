const express = require("express")
const upload = require("../middlewares/upload")
const Fiscal = require("../models/Fiscal")

const router = express.Router()

const {
  autenticar,
} = require("../middlewares/authMiddleware")

function calcularAlertaFiscal(vencimento, status) {
  const hoje = new Date()
  const dataVencimento = new Date(vencimento)

  hoje.setHours(0, 0, 0, 0)
  dataVencimento.setHours(0, 0, 0, 0)

  const diferencaMs =
    dataVencimento.getTime() - hoje.getTime()

  const diasParaVencer = Math.ceil(
    diferencaMs / (1000 * 60 * 60 * 24)
  )

  let alertaFiscal = "Em dia"

  if (status === "Pago" || status === "Enviado") {
    alertaFiscal = "Regularizado"
  } else if (diasParaVencer < 0) {
    alertaFiscal = "Vencido"
  } else if (diasParaVencer === 0) {
    alertaFiscal = "Vence hoje"
  } else if (diasParaVencer <= 3) {
    alertaFiscal = "Vencendo"
  }

  return {
    diasParaVencer,
    alertaFiscal,
  }
}

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

    const obrigacoes = await Fiscal.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    res.json(obrigacoes)
  } catch (error) {
    console.error(
      "ERRO AO LISTAR OBRIGAÇÕES:",
      error
    )

    res.status(500).json({
      message: "Erro ao listar obrigações",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    const alerta = calcularAlertaFiscal(
      req.body.vencimento,
      req.body.status
    )

    const novaObrigacao =
      await Fiscal.create({
        ...req.body,
        diasParaVencer: alerta.diasParaVencer,
        alertaFiscal: alerta.alertaFiscal,
        empresaId:
          req.usuario?.empresaId ||
          req.body.empresaId ||
          null,
      })

    res.status(201).json(novaObrigacao)
  } catch (error) {
    console.error(
      "ERRO AO CRIAR OBRIGAÇÃO:",
      error
    )

    res.status(500).json({
      message: "Erro ao criar obrigação",
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const obrigacao =
      await Fiscal.findByPk(id)

    if (!obrigacao) {
      return res.status(404).json({
        message:
          "Obrigação não encontrada",
      })
    }

    const alerta = calcularAlertaFiscal(
      req.body.vencimento,
      req.body.status
    )

    await obrigacao.update({
      ...req.body,
      diasParaVencer: alerta.diasParaVencer,
      alertaFiscal: alerta.alertaFiscal,
    })

    res.json(obrigacao)
  } catch (error) {
    console.error(
      "ERRO AO ATUALIZAR OBRIGAÇÃO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao atualizar obrigação",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const obrigacao =
      await Fiscal.findByPk(id)

    if (!obrigacao) {
      return res.status(404).json({
        message:
          "Obrigação não encontrada",
      })
    }

    await obrigacao.destroy()

    res.json({
      message:
        "Obrigação excluída com sucesso",
    })
  } catch (error) {
    console.error(
      "ERRO AO EXCLUIR OBRIGAÇÃO:",
      error
    )

    res.status(500).json({
      message:
        "Erro ao excluir obrigação",
    })
  }
})

router.post(
  "/upload",
  autenticar,
  upload.array("arquivos"),
  async (req, res) => {
    try {
      const arquivos = req.files.map(
        (file) => ({
          nome: file.originalname,
          caminho: `/uploads/${file.filename}`,
        })
      )

      res.json(arquivos)
    } catch (error) {
      console.error(
        "ERRO NO UPLOAD FISCAL:",
        error
      )

      res.status(500).json({
        message:
          "Erro ao fazer upload fiscal",
      })
    }
  }
)

module.exports = router
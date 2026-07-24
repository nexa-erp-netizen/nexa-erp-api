const express = require("express")
const { Op } = require("sequelize")
const Financeiro = require("../models/Financeiro")
const upload = require("../middlewares/upload")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

function adicionarMeses(dataBase, quantidadeMeses, diaVencimento) {
  const data = new Date(dataBase)

  data.setMonth(data.getMonth() + quantidadeMeses)
  data.setDate(Number(diaVencimento))

  return data.toISOString().slice(0, 10)
}

// LISTAR FINANCEIRO
router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      if (req.usuario.clienteVinculado) {
        where.cliente = req.usuario.clienteVinculado
        where[Op.or] = [
          { origem: { [Op.notIn]: ["Serviço Avulso", "Serviço do Cliente"] } },
          { origem: { [Op.is]: null } },
        ]
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
    const {
      recorrenteMensal,
      diaVencimento,
      quantidadeMeses,
      ...dadosLancamento
    } = req.body

    const empresaId =
      req.usuario?.empresaId ||
      req.body.empresaId ||
      null

    if (recorrenteMensal) {
      const meses = Number(quantidadeMeses || 12)
      const dia = Number(diaVencimento || 10)

      const lancamentosRecorrentes = []

      for (let i = 0; i < meses; i++) {
        const vencimentoGerado = adicionarMeses(
          dadosLancamento.vencimento || new Date(),
          i,
          dia
        )

        lancamentosRecorrentes.push({
          ...dadosLancamento,
          vencimento: vencimentoGerado,
          status: "Pendente",
          empresaId,
          recorrenteMensal: true,
          diaVencimento: dia,
          parcelaRecorrente: `${i + 1}/${meses}`,
        })
      }

      const criados = await Financeiro.bulkCreate(
        lancamentosRecorrentes
      )

      return res.status(201).json({
        message: "Lançamentos recorrentes criados com sucesso",
        total: criados.length,
        lancamentos: criados,
      })
    }

    const novoLancamento = await Financeiro.create({
      ...dadosLancamento,
      empresaId,
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

    if (
      ["Serviço Avulso", "Serviço do Cliente"].includes(lancamento.origem) ||
      String(lancamento.referenciaOrigem || "").startsWith("servico-avulso:")
    ) {
      return res.status(409).json({
        message: "Corrija este lançamento na Central do Cliente, em Serviços e cobranças",
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

    if (
      ["Serviço Avulso", "Serviço do Cliente"].includes(lancamento.origem) ||
      String(lancamento.referenciaOrigem || "").startsWith("servico-avulso:")
    ) {
      return res.status(409).json({
        message: "Exclua este lançamento na Central do Cliente, em Serviços e cobranças",
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
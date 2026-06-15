const express = require("express")

const LancamentoContabil = require("../models/LancamentoContabil")
const Financeiro = require("../models/Financeiro")
const upload = require("../middlewares/upload")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()


function somenteEquipe(req, res, next) {
  if (!["Administrador", "Funcionário"].includes(req.usuario.perfil)) {
    return res.status(403).json({ message: "Acesso negado" })
  }

  next()
}


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

router.post("/", autenticar, somenteEquipe, async (req, res) => {
  try {
    const data =
      req.body.data ||
      new Date().toISOString().slice(0, 10)

    const partesData = data.split("-")

    const competencia =
      req.body.competencia ||
      (
        partesData.length === 3
          ? `${partesData[1]}/${partesData[0]}`
          : "01/2026"
      )

    const tipoContabil =
      String(req.body.tipo || "").toLowerCase() === "receita"
        ? "Receita"
        : "Despesa"

    const planoConta =
      req.body.planoConta ||
      req.body.categoria ||
      (
        req.body.origem === "servico"
          ? "Serviços Contábeis"
          : "Lançamento Manual"
      )

    const valor =
      req.body.valor !== undefined &&
      req.body.valor !== null
        ? String(req.body.valor)
        : "0"

    const novoLancamento =
      await LancamentoContabil.create({
        cliente: req.body.cliente,
        data,
        competencia,
        tipo: tipoContabil,
        planoConta,
        descricao:
          req.body.descricao ||
          "Lançamento contábil",
        valor,
        formaPagamento:
          req.body.formaPagamento || "",
        observacao:
          req.body.observacao || "",
        anexos:
          req.body.anexos || [],
        empresaId:
          req.usuario?.empresaId || null,
      })

    if (req.body.origem === "servico") {
      await Financeiro.create({
        descricao:
          req.body.descricao || "Serviço",
        cliente:
          req.body.cliente,
        tipo: "Receber",
        valor,
        vencimento: data,
        status: "Pendente",
        anexos: [],
        empresaId:
          req.usuario?.empresaId || null,
      })
    }

    res.status(201).json(novoLancamento)
  } catch (error) {
    console.error("ERRO AO CRIAR LANÇAMENTO:", error)

    res.status(500).json({
      message: "Erro ao criar lançamento",
      erro: error.message,
    })
  }
})

router.put("/:id", autenticar, somenteEquipe, async (req, res) => {
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

router.delete("/:id", autenticar, somenteEquipe, async (req, res) => {
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

module.exports = router

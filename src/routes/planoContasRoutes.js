const express = require("express")
const PlanoConta = require("../models/PlanoConta")

const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

const NATUREZAS_PADRAO = new Map([
  ["receita bruta mensal", "Credora"],
  ["simples a recolher", "Credora"],
  ["simples nacional", "Devedora"],
  ["caixa", "Devedora"],
  ["bancos", "Devedora"],
])

function normalizarConta(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

async function corrigirNaturezasPadrao() {
  const contas = await PlanoConta.findAll()
  const corrigidas = []

  for (const conta of contas) {
    const naturezaEsperada = NATUREZAS_PADRAO.get(normalizarConta(conta.conta))
    if (!naturezaEsperada) continue

    if (normalizarConta(conta.natureza) !== normalizarConta(naturezaEsperada)) {
      await conta.update({ natureza: naturezaEsperada })
      corrigidas.push(`${conta.codigo || "-"} - ${conta.conta}: ${naturezaEsperada}`)
    }
  }

  if (corrigidas.length) {
    console.log("PLANO DE CONTAS — naturezas padrão corrigidas:", corrigidas.join(" | "))
  }
}

function somenteEquipe(req, res, next) {
  if (!["Administrador", "Funcionário"].includes(req.usuario.perfil)) {
    return res.status(403).json({ message: "Acesso negado" })
  }

  next()
}

router.use(autenticar)

router.get("/", async (req, res) => {
  try {
    await corrigirNaturezasPadrao()

    const contas = await PlanoConta.findAll({
      order: [["createdAt", "DESC"]],
    })

    res.json(contas)
  } catch (error) {
    console.error("ERRO AO LISTAR PLANO DE CONTAS:", error)

    res.status(500).json({
      message: "Erro ao listar plano de contas",
    })
  }
})

router.post("/", somenteEquipe, async (req, res) => {
  try {
    const novaConta = await PlanoConta.create(req.body)

    res.status(201).json(novaConta)
  } catch (error) {
    console.error("ERRO AO CRIAR CONTA:", error)

    res.status(500).json({
      message: "Erro ao criar conta",
    })
  }
})

router.put("/:id", somenteEquipe, async (req, res) => {
  try {
    const { id } = req.params
    const conta = await PlanoConta.findByPk(id)

    if (!conta) {
      return res.status(404).json({
        message: "Conta não encontrada",
      })
    }

    await conta.update(req.body)

    res.json(conta)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR CONTA:", error)

    res.status(500).json({
      message: "Erro ao atualizar conta",
    })
  }
})

router.delete("/:id", somenteEquipe, async (req, res) => {
  try {
    const { id } = req.params
    const conta = await PlanoConta.findByPk(id)

    if (!conta) {
      return res.status(404).json({
        message: "Conta não encontrada",
      })
    }

    await conta.destroy()

    res.json({
      message: "Conta excluída com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR CONTA:", error)

    res.status(500).json({
      message: "Erro ao excluir conta",
    })
  }
})

module.exports = router

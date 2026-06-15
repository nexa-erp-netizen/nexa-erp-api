const express = require("express")
const LancamentoContabil = require("../models/LancamentoContabil")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

function valorNumerico(valorFormatado) {
  return Number(
    String(valorFormatado)
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  )
}

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

router.get("/dre", autenticar, async (req, res) => {
  try {
    const { cliente } = req.query

    const where = {}

    if (req.usuario.perfil === "Cliente") {
      where.cliente = req.usuario.clienteVinculado
    }

    if (req.usuario.empresaId) {
      where.empresaId = req.usuario.empresaId
    }

    let lancamentos = await LancamentoContabil.findAll({ where })

    if (cliente && req.usuario.perfil !== "Cliente") {
      lancamentos = lancamentos.filter(
        (item) =>
          normalizar(item.cliente) === normalizar(cliente)
      )
    }

    const receitas = lancamentos.filter(
      (item) => item.tipo === "Receita"
    )

    const despesas = lancamentos.filter(
      (item) => item.tipo === "Despesa"
    )

    const totalReceitas = receitas.reduce(
      (total, item) => total + valorNumerico(item.valor),
      0
    )

    const totalDespesas = despesas.reduce(
      (total, item) => total + valorNumerico(item.valor),
      0
    )

    res.json({
      cliente:
        req.usuario.perfil === "Cliente"
          ? req.usuario.clienteVinculado
          : cliente || "Todos",
      totalReceitas,
      totalDespesas,
      resultado: totalReceitas - totalDespesas,
      quantidadeLancamentos: lancamentos.length,
    })
  } catch (error) {
    console.error("ERRO AO GERAR DRE:", error)

    res.status(500).json({
      message: "Erro ao gerar DRE",
    })
  }
})

module.exports = router

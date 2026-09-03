const express = require("express")
const LancamentoContabil = require("../models/LancamentoContabil")
const { autenticar } = require("../middlewares/authMiddleware")
const {
  resolverClienteFinanceiro,
  resolverClienteDoUsuario,
  registroPertenceAoCliente,
  vincularClienteIdSeNecessario,
} = require("../services/clienteFinanceiroService")

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
    const { cliente, clienteId } = req.query
    let clienteFiltro = null

    if (req.usuario.perfil === "Cliente") {
      clienteFiltro = await resolverClienteDoUsuario(req.usuario)
      if (!clienteFiltro) {
        return res.json({
          cliente: req.usuario.clienteVinculado || "Cliente",
          clienteId: null,
          totalReceitas: 0,
          totalDespesas: 0,
          resultado: 0,
          quantidadeLancamentos: 0,
        })
      }
    } else if (clienteId || cliente) {
      clienteFiltro = await resolverClienteFinanceiro({ clienteId, cliente })
      if (!clienteFiltro) return res.status(404).json({ message: "Cliente não encontrado" })
    }

    const where = {}
    if (req.usuario.empresaId) where.empresaId = req.usuario.empresaId

    let lancamentos = await LancamentoContabil.findAll({ where })

    if (clienteFiltro) {
      lancamentos = lancamentos.filter((item) => registroPertenceAoCliente(item, clienteFiltro))
      for (const item of lancamentos) {
        await vincularClienteIdSeNecessario(item, clienteFiltro)
      }
    }

    const receitas = lancamentos.filter((item) => normalizar(item.tipo) === "receita")
    const despesas = lancamentos.filter((item) => normalizar(item.tipo) === "despesa")

    const totalReceitas = receitas.reduce(
      (total, item) => total + valorNumerico(item.valor),
      0
    )

    const totalDespesas = despesas.reduce(
      (total, item) => total + valorNumerico(item.valor),
      0
    )

    res.json({
      cliente: clienteFiltro?.nome || "Todos",
      clienteId: clienteFiltro?.id || null,
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

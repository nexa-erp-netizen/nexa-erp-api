const express = require("express")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

function limpar(body) {
  return {
    clienteId: Number(body.clienteId),
    cliente: String(body.cliente || "").trim(),
    tipo: String(body.tipo || "Procuração e-CAC").trim(),
    dataInicio: body.dataInicio || null,
    dataValidade: body.dataValidade || null,
    outorgante: body.outorgante || null,
    outorgado: body.outorgado || null,
    servicosAutorizados: body.servicosAutorizados || null,
    responsavel: body.responsavel || null,
    observacoes: body.observacoes || null,
    ativa: body.ativa !== false,
  }
}

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)

    const procuracoes = await ProcuracaoEcac.findAll({
      where,
      order: [["dataValidade", "ASC"]],
    })

    res.json(procuracoes)
  } catch (error) {
    console.error("ERRO AO LISTAR PROCURACOES ECAC:", error)
    res.status(500).json({ message: "Erro ao listar procurações e-CAC" })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({ message: "Acesso negado" })
    }

    const dados = limpar(req.body)
    if (!dados.clienteId || !dados.cliente || !dados.dataValidade) {
      return res.status(400).json({ message: "Cliente e data de validade são obrigatórios." })
    }

    const procuracao = await ProcuracaoEcac.create(dados)
    res.status(201).json(procuracao)
  } catch (error) {
    console.error("ERRO AO CRIAR PROCURACAO ECAC:", error)
    res.status(500).json({ message: "Erro ao cadastrar procuração e-CAC" })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({ message: "Acesso negado" })
    }

    const procuracao = await ProcuracaoEcac.findByPk(req.params.id)
    if (!procuracao) return res.status(404).json({ message: "Procuração não encontrada" })

    await procuracao.update(limpar(req.body))
    res.json(procuracao)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR PROCURACAO ECAC:", error)
    res.status(500).json({ message: "Erro ao atualizar procuração e-CAC" })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({ message: "Acesso negado" })
    }

    const procuracao = await ProcuracaoEcac.findByPk(req.params.id)
    if (!procuracao) return res.status(404).json({ message: "Procuração não encontrada" })

    await procuracao.destroy()
    res.json({ message: "Procuração excluída" })
  } catch (error) {
    console.error("ERRO AO EXCLUIR PROCURACAO ECAC:", error)
    res.status(500).json({ message: "Erro ao excluir procuração e-CAC" })
  }
})

module.exports = router

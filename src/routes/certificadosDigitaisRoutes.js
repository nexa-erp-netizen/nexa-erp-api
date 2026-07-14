const express = require("express")
const CertificadoDigital = require("../models/CertificadoDigital")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

function limpar(body) {
  return {
    clienteId: Number(body.clienteId),
    cliente: String(body.cliente || "").trim(),
    tipo: body.tipo || "A1",
    dataEmissao: body.dataEmissao || null,
    dataValidade: body.dataValidade || null,
    autoridadeCertificadora: body.autoridadeCertificadora || null,
    numeroSerie: body.numeroSerie || null,
    localArquivo: body.localArquivo || null,
    responsavel: body.responsavel || null,
    observacoes: body.observacoes || null,
    ativo: body.ativo !== false,
  }
}

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.query.clienteId) {
      where.clienteId = Number(req.query.clienteId)
    }

    const certificados = await CertificadoDigital.findAll({
      where,
      order: [["dataValidade", "ASC"]],
    })

    res.json(certificados)
  } catch (error) {
    console.error("ERRO AO LISTAR CERTIFICADOS:", error)
    res.status(500).json({ message: "Erro ao listar certificados digitais" })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({ message: "Acesso negado" })
    }

    const dados = limpar(req.body)

    if (!dados.clienteId || !dados.cliente || !dados.dataValidade) {
      return res.status(400).json({
        message: "Cliente e data de validade são obrigatórios.",
      })
    }

    const certificado = await CertificadoDigital.create(dados)
    res.status(201).json(certificado)
  } catch (error) {
    console.error("ERRO AO CRIAR CERTIFICADO:", error)
    res.status(500).json({ message: "Erro ao cadastrar certificado digital" })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({ message: "Acesso negado" })
    }

    const certificado = await CertificadoDigital.findByPk(req.params.id)

    if (!certificado) {
      return res.status(404).json({ message: "Certificado não encontrado" })
    }

    await certificado.update(limpar(req.body))
    res.json(certificado)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR CERTIFICADO:", error)
    res.status(500).json({ message: "Erro ao atualizar certificado digital" })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({ message: "Acesso negado" })
    }

    const certificado = await CertificadoDigital.findByPk(req.params.id)

    if (!certificado) {
      return res.status(404).json({ message: "Certificado não encontrado" })
    }

    await certificado.destroy()
    res.json({ message: "Certificado excluído" })
  } catch (error) {
    console.error("ERRO AO EXCLUIR CERTIFICADO:", error)
    res.status(500).json({ message: "Erro ao excluir certificado digital" })
  }
})

module.exports = router

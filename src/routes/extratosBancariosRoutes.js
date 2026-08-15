const express = require("express")
const multer = require("multer")
const crypto = require("crypto")
const { Op } = require("sequelize")
const ContaBancariaCliente = require("../models/ContaBancariaCliente")
const ImportacaoExtratoBancario = require("../models/ImportacaoExtratoBancario")
const MovimentoBancario = require("../models/MovimentoBancario")
const { lerExtrato } = require("../services/extratoBancarioParser")

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private")
  res.set("Pragma", "no-cache")
  res.set("Expires", "0")
  next()
})

router.use((req, res, next) =>
  req.usuario.perfil === "Cliente"
    ? res.status(403).json({ message: "Acesso restrito ao escritório" })
    : next()
)

router.post("/importar", upload.single("arquivo"), async (req, res) => {
  let importacao = null
  try {
    if (!req.file) return res.status(400).json({ message: "Selecione um arquivo OFX ou CSV." })
    const conta = await ContaBancariaCliente.findByPk(Number(req.body.contaBancariaId))
    if (!conta || !conta.ativo) return res.status(400).json({ message: "Selecione uma conta bancária ativa." })
    const extensao = String(req.file.originalname || "").split(".").pop().toUpperCase()
    if (!["OFX", "CSV"].includes(extensao)) return res.status(400).json({ message: "Formato inválido. Envie um arquivo OFX ou CSV." })

    const hashArquivo = crypto.createHash("sha256").update(req.file.buffer).digest("hex")
    if (await ImportacaoExtratoBancario.findOne({ where: { contaBancariaId: conta.id, hashArquivo } })) {
      return res.status(409).json({ message: "Este mesmo extrato já foi importado para esta conta." })
    }

    const leitura = lerExtrato(req.file.buffer, extensao)
    if (!leitura.movimentos.length) return res.status(400).json({ message: "Nenhum movimento válido foi encontrado no extrato." })

    const datas = leitura.movimentos.map(item => item.data).sort()
    importacao = await ImportacaoExtratoBancario.create({
      clienteId: conta.clienteId, cliente: conta.cliente, contaBancariaId: conta.id,
      nomeArquivo: req.file.originalname, formato: extensao, hashArquivo,
      totalLidos: leitura.movimentos.length, saldoInformado: leitura.saldoInformado,
      dataInicio: datas[0], dataFim: datas[datas.length - 1], status: "Processando",
    })

    const ocorrencias = new Map()
    const preparados = leitura.movimentos.map(item => {
      const base = item.fitId
        ? `fitid|${conta.id}|${item.fitId}`
        : `mov|${conta.id}|${item.data}|${Number(item.valorAssinado).toFixed(2)}|${normalizar(item.descricao)}|${item.documento || ""}`
      const numero = (ocorrencias.get(base) || 0) + 1
      ocorrencias.set(base, numero)
      const hashMovimento = crypto.createHash("sha256").update(`${base}|${item.fitId ? 1 : numero}`).digest("hex")
      return { ...item, hashMovimento }
    })

    const hashes = preparados.map(item => item.hashMovimento)
    const existentes = await MovimentoBancario.findAll({ where: { contaBancariaId: conta.id, hashMovimento: { [Op.in]: hashes } }, attributes: ["hashMovimento"] })
    const hashesExistentes = new Set(existentes.map(item => item.hashMovimento))
    const novos = preparados.filter(item => !hashesExistentes.has(item.hashMovimento))
    const registros = novos.map(item => ({
      clienteId: conta.clienteId, cliente: conta.cliente, contaBancariaId: conta.id, importacaoId: importacao.id,
      data: item.data, descricao: item.descricao.slice(0, 500), documento: item.documento,
      fitId: item.fitId, tipoBanco: item.tipoBanco,
      natureza: item.valorAssinado >= 0 ? "Entrada" : "Saída",
      valor: Math.abs(item.valorAssinado), valorAssinado: item.valorAssinado,
      hashMovimento: item.hashMovimento, statusConciliacao: "Pendente",
    }))
    if (registros.length) await MovimentoBancario.bulkCreate(registros)

    const totalEntradas = novos.filter(i => i.valorAssinado > 0).reduce((s, i) => s + i.valorAssinado, 0)
    const totalSaidas = novos.filter(i => i.valorAssinado < 0).reduce((s, i) => s + Math.abs(i.valorAssinado), 0)
    await importacao.update({
      totalImportados: novos.length,
      totalDuplicados: preparados.length - novos.length,
      totalEntradas,
      totalSaidas,
      status: "Importado",
    })

    res.status(201).json({
      importacao,
      resumo: { lidos: preparados.length, importados: novos.length, duplicados: preparados.length - novos.length, totalEntradas, totalSaidas, saldoInformado: leitura.saldoInformado },
    })
  } catch (error) {
    console.error(error)
    if (importacao) await importacao.update({ status: "Erro" }).catch(() => {})
    res.status(400).json({ message: error.message || "Erro ao importar extrato bancário" })
  }
})

router.get("/movimentos", async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.contaBancariaId) where.contaBancariaId = Number(req.query.contaBancariaId)
    if (req.query.status) where.statusConciliacao = req.query.status
    if (req.query.inicio || req.query.fim) {
      where.data = {}
      if (req.query.inicio) where.data[Op.gte] = req.query.inicio
      if (req.query.fim) where.data[Op.lte] = req.query.fim
    }
    const movimentos = await MovimentoBancario.findAll({ where, order: [["data", "DESC"], ["id", "DESC"]], limit: 2000 })
    res.json(movimentos)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao listar movimentos bancários" })
  }
})

router.get("/importacoes", async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.contaBancariaId) where.contaBancariaId = Number(req.query.contaBancariaId)
    res.json(await ImportacaoExtratoBancario.findAll({ where, order: [["createdAt", "DESC"]], limit: 100 }))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao listar importações" })
  }
})

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "O extrato deve ter no máximo 10 MB." })
  if (error) return res.status(400).json({ message: "Não foi possível receber o arquivo." })
  next()
})

module.exports = router

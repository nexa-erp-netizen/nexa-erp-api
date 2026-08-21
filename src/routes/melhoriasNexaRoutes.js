const express = require("express")
const MelhoriaNexa = require("../models/MelhoriaNexa")
const { analisarProdutoPelaNexa } = require("../services/nexaAnalistaProdutoService")

const router = express.Router()

router.post("/proativa", async (req, res) => {
  const resultado = await analisarProdutoPelaNexa({
    mensagem: "Nexa, avalie proativamente o sistema e sugira melhorias úteis.",
    usuario: req.usuario,
    paginaAtual: req.body?.paginaAtual || "",
    clienteId: req.body?.clienteId || null,
  })
  return res.json({ registradas: resultado?.melhorias?.length || 0 })
})

router.get("/", async (req, res) => {
  const where = {}
  if (req.query.status) where.status = String(req.query.status)
  res.json(await MelhoriaNexa.findAll({ where, order: [["ultimaAnaliseEm", "DESC"]], limit: 200 }))
})

router.patch("/:id/status", async (req, res) => {
  const item = await MelhoriaNexa.findByPk(req.params.id)
  if (!item) return res.status(404).json({ message: "Melhoria não encontrada" })
  const permitidos = ["Sugerida", "Aprovada", "Em execução", "Concluída", "Descartada"]
  const status = permitidos.includes(req.body.status) ? req.body.status : "Sugerida"
  await item.update({ status })
  return res.json(item)
})

module.exports = router

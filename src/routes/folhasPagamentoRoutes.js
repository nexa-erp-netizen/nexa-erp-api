const express = require("express")
const PDFDocument = require("pdfkit")
const Folha = require("../models/FolhaPagamento")
const Funcionario = require("../models/Funcionario")
const Cliente = require("../models/Cliente")
const { autenticar } = require("../middlewares/authMiddleware")
const { calcularFolha } = require("../services/calculoFolhaService")

const router = express.Router()
const numero = (v) => Number(v || 0)
const dinheiro = (v) => numero(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const camposEntrada = ["horasExtras50","horasExtras100","faltasDias","atrasosHoras","comissoes","bonus","outrosProventos","outrosDescontos","pensaoAlimenticia","descontoValeTransporte","descontoValeAlimentacao"]

router.use(autenticar)
router.use((req,res,next)=> req.usuario.perfil === "Cliente" ? res.status(403).json({message:"Acesso negado"}) : next())

router.get("/", async (req,res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.competencia) where.competencia = req.query.competencia
    res.json(await Folha.findAll({ where, order:[["competencia","DESC"],["funcionario","ASC"]] }))
  } catch (e) { console.error(e); res.status(500).json({message:"Erro ao listar folhas"}) }
})

router.post("/calcular", async (req,res) => {
  try {
    const funcionario = await Funcionario.findByPk(req.body.funcionarioId)
    if (!funcionario) return res.status(404).json({message:"Funcionário não encontrado"})
    res.json(calcularFolha(funcionario.toJSON(), req.body))
  } catch (e) { console.error(e); res.status(500).json({message:"Erro ao calcular folha"}) }
})

router.post("/", async (req,res) => {
  try {
    const funcionario = await Funcionario.findByPk(req.body.funcionarioId)
    const cliente = funcionario ? await Cliente.findByPk(funcionario.clienteId) : null
    if (!funcionario || !cliente) return res.status(400).json({message:"Funcionário ou empresa inválidos"})
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.body.competencia || ""))) return res.status(400).json({message:"Informe a competência no formato AAAA-MM"})
    const calculo = calcularFolha(funcionario.toJSON(), req.body)
    const entrada = { clienteId:cliente.id, cliente:cliente.nome, funcionarioId:funcionario.id, funcionario:funcionario.nome, competencia:req.body.competencia, observacoes:req.body.observacoes || null, ...calculo }
    camposEntrada.forEach(c => { entrada[c] = numero(req.body[c]) })
    const [folha, criada] = await Folha.findOrCreate({ where:{funcionarioId:funcionario.id, competencia:req.body.competencia}, defaults:entrada })
    if (!criada) {
      if (folha.status === "Fechada") return res.status(409).json({message:"A folha está fechada. Reabra antes de recalcular."})
      await folha.update(entrada)
    }
    res.status(criada ? 201 : 200).json(folha)
  } catch (e) { console.error(e); res.status(500).json({message:"Erro ao salvar folha"}) }
})

router.patch("/:id/status", async (req,res) => {
  try {
    const folha = await Folha.findByPk(req.params.id)
    if (!folha) return res.status(404).json({message:"Folha não encontrada"})
    const status = req.body.status === "Fechada" ? "Fechada" : "Rascunho"
    await folha.update({status, fechadoEm: status === "Fechada" ? new Date() : null})
    res.json(folha)
  } catch(e) { console.error(e); res.status(500).json({message:"Erro ao alterar folha"}) }
})

router.get("/:id/holerite", async (req,res) => {
  try {
    const folha = await Folha.findByPk(req.params.id)
    const funcionario = folha ? await Funcionario.findByPk(folha.funcionarioId) : null
    const cliente = folha ? await Cliente.findByPk(folha.clienteId) : null
    if (!folha || !funcionario || !cliente) return res.status(404).json({message:"Holerite não encontrado"})
    const doc = new PDFDocument({size:"A4",margin:36})
    const partes=[]; doc.on("data",p=>partes.push(p)); doc.on("end",()=>{ const pdf=Buffer.concat(partes); res.setHeader("Content-Type","application/pdf"); res.setHeader("Content-Disposition",`attachment; filename=holerite-${folha.competencia}-${funcionario.nome.replace(/[^a-z0-9]/gi,"-")}.pdf`); res.send(pdf) })
    doc.fontSize(16).text("RECIBO DE PAGAMENTO DE SALÁRIO",{align:"center"}).moveDown(.4)
    doc.fontSize(10).text(`${cliente.nome}  |  CPF/CNPJ: ${cliente.cnpj || cliente.cpf || "-"}`)
    doc.text(`Funcionário: ${funcionario.nome}  |  CPF: ${funcionario.cpf}  |  Matrícula: ${funcionario.matricula || "-"}`)
    doc.text(`Cargo: ${funcionario.cargo}  |  Competência: ${folha.competencia}`).moveDown()
    doc.fontSize(10).text("DESCRIÇÃO                                      PROVENTOS       DESCONTOS")
    doc.moveTo(36,doc.y+3).lineTo(559,doc.y+3).stroke().moveDown(.5)
    for (const item of folha.proventos || []) doc.text(`${item.descricao}`.padEnd(52)+dinheiro(item.valor).padStart(14))
    for (const item of folha.descontos || []) doc.text(`${item.descricao}`.padEnd(68)+dinheiro(item.valor).padStart(14))
    doc.moveDown().text(`Total de proventos: R$ ${dinheiro(folha.totalProventos)}`,{align:"right"})
    doc.text(`Total de descontos: R$ ${dinheiro(folha.totalDescontos)}`,{align:"right"})
    doc.fontSize(13).text(`LÍQUIDO A RECEBER: R$ ${dinheiro(folha.liquido)}`,{align:"right"}).moveDown()
    doc.fontSize(9).text(`Bases: INSS R$ ${dinheiro(folha.baseInss)} | IRRF R$ ${dinheiro(folha.baseIrrf)} | FGTS R$ ${dinheiro(folha.baseFgts)} | Depósito FGTS R$ ${dinheiro(folha.fgts)}`)
    doc.moveDown(3).text("Declaro ter recebido a importância líquida discriminada neste recibo.")
    doc.moveDown(3).text("Data: ____/____/________       Assinatura: __________________________________________")
    doc.end()
  } catch(e) { console.error(e); res.status(500).json({message:"Erro ao gerar holerite"}) }
})

module.exports = router

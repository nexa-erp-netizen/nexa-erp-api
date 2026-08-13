const express = require("express")
const { Op } = require("sequelize")
const Socio = require("../models/Socio")
const Cliente = require("../models/Cliente")
const router = express.Router()
const digitos = v => String(v || "").replace(/\D/g, "")

router.use((req,res,next)=>req.usuario.perfil === "Cliente" ? res.status(403).json({message:"Acesso restrito ao escritório"}) : next())

router.get("/", async (req,res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.status) where.status = req.query.status
    res.json(await Socio.findAll({where,order:[["nome","ASC"]]}))
  } catch(e) { console.error(e); res.status(500).json({message:"Erro ao listar sócios"}) }
})

router.post("/", async (req,res) => {
  try {
    const cliente = await Cliente.findByPk(req.body.clienteId)
    const cpf = digitos(req.body.cpf)
    if (!cliente || !String(req.body.nome||"").trim() || cpf.length !== 11) return res.status(400).json({message:"Informe empresa, nome e CPF válido do sócio."})
    const repetido = await Socio.findOne({where:{clienteId:cliente.id,cpf,status:{[Op.ne]:"Excluído"}}})
    if (repetido) return res.status(409).json({message:"Este CPF já está cadastrado nesta empresa."})
    const socio = await Socio.create(dados(req.body,cliente,cpf))
    res.status(201).json(socio)
  } catch(e) { console.error(e); res.status(500).json({message:"Erro ao cadastrar sócio"}) }
})

router.put("/:id", async (req,res) => {
  try {
    const socio = await Socio.findByPk(req.params.id)
    const cliente = socio && await Cliente.findByPk(req.body.clienteId || socio.clienteId)
    const cpf = digitos(req.body.cpf)
    if (!socio) return res.status(404).json({message:"Sócio não encontrado"})
    if (!cliente || !String(req.body.nome||"").trim() || cpf.length !== 11) return res.status(400).json({message:"Informe empresa, nome e CPF válido do sócio."})
    const repetido = await Socio.findOne({where:{id:{[Op.ne]:socio.id},clienteId:cliente.id,cpf,status:{[Op.ne]:"Excluído"}}})
    if (repetido) return res.status(409).json({message:"Este CPF já está cadastrado nesta empresa."})
    await socio.update(dados(req.body,cliente,cpf)); res.json(socio)
  } catch(e) { console.error(e); res.status(500).json({message:"Erro ao atualizar sócio"}) }
})

router.delete("/:id", async (req,res) => {
  try { const socio=await Socio.findByPk(req.params.id);if(!socio)return res.status(404).json({message:"Sócio não encontrado"});await socio.update({status:"Excluído"});res.json({message:"Sócio removido"}) }
  catch(e){console.error(e);res.status(500).json({message:"Erro ao remover sócio"})}
})

function dados(body,cliente,cpf) {
  return { clienteId:cliente.id,cliente:cliente.nome,nome:String(body.nome).trim(),cpf,dataNascimento:body.dataNascimento||null,nisNitPis:String(body.nisNitPis||"").trim()||null,qualificacao:String(body.qualificacao||"Sócio-administrador").trim(),dataEntrada:body.dataEntrada||null,participacaoPercentual:body.participacaoPercentual===""?null:Number(body.participacaoPercentual||0),valorProLabore:Number(body.valorProLabore||0),dependentesIrrf:Math.max(0,Number(body.dependentesIrrf||0)),contribuicaoOutrosVinculos:Number(body.contribuicaoOutrosVinculos||0),banco:String(body.banco||"").trim()||null,agencia:String(body.agencia||"").trim()||null,conta:String(body.conta||"").trim()||null,chavePix:String(body.chavePix||"").trim()||null,status:body.status||"Ativo",observacoes:String(body.observacoes||"").trim()||null }
}

module.exports = router

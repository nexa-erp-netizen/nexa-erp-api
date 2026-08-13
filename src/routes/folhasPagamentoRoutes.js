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
const codigosHolerite = {
  "Salário":"101", "Horas extras 50%":"120", "Horas extras 100%":"121", Insalubridade:"130", Periculosidade:"131",
  "Comissões":"140", "Bônus":"141", "Outros proventos":"199", "Salário-família":"987", Faltas:"901", Atrasos:"902",
  INSS:"973", IRRF:"987", "Vale-transporte":"920", "Vale-alimentação":"921", "Pensão alimentícia":"930", "Outros descontos":"999",
}
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
    const doc = new PDFDocument({size:"A4",layout:"landscape",margin:20})
    const partes=[]; doc.on("data",p=>partes.push(p)); doc.on("end",()=>{ const pdf=Buffer.concat(partes); res.setHeader("Content-Type","application/pdf"); res.setHeader("Content-Disposition",`attachment; filename=holerite-${folha.competencia}-${funcionario.nome.replace(/[^a-z0-9]/gi,"-")}.pdf`); res.send(pdf) })
    const verdeFundo="#e5f7e7", verdeCabecalho="#bcebc2", verdeLinha="#70bd7c", verdeTexto="#176b2d"
    const caixa=(cx,cy,cw,ch,fill=verdeFundo)=>doc.save().rect(cx,cy,cw,ch).fillAndStroke(fill,verdeLinha).restore()
    const texto=(t,tx,ty,tw,op={})=>doc.fillColor(op.cor||"#163b22").font(op.negrito?"Helvetica-Bold":"Helvetica").fontSize(op.tamanho||8).text(String(t??""),tx,ty,{width:tw,height:op.altura||14,align:op.align||"left",ellipsis:true,lineBreak:false})
    const [ano,mes]=folha.competencia.split("-")
    const meses=["","JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"]
    const percentual=(valor,base)=>base>0?`${(numero(valor)/numero(base)*100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`:"0,00%"
    const referencia=(item)=>{
      if(item.descricao==="Salário") return `${folha.diasTrabalhados||30} dias`
      if(item.descricao==="Horas extras 50%") return `${folha.horasExtras50||0} h`
      if(item.descricao==="Horas extras 100%") return `${folha.horasExtras100||0} h`
      if(item.descricao==="Faltas") return `${folha.faltasDias||0} dias`
      if(item.descricao==="Atrasos") return `${folha.atrasosHoras||0} h`
      if(item.descricao==="INSS") return percentual(folha.inss,folha.baseInss)
      if(item.descricao==="IRRF") return percentual(folha.irrf,folha.baseIrrf)
      return "-"
    }
    const desenharVia=(y,via)=>{
      const x=20,w=802,h=260,assinaturaW=145,corpoW=w-assinaturaW,headerH=55,tabH=120,totH=35,baseH=50
      caixa(x,y,w,h); caixa(x,y,corpoW,headerH,verdeCabecalho)
      texto(cliente.nome||"EMPRESA",x+8,y+7,300,{negrito:true,tamanho:11})
      texto(`CNPJ/CPF: ${cliente.cnpj||cliente.cpf||"-"}`,x+8,y+24,300,{tamanho:7})
      texto("RECIBO DE PAGAMENTO DE SALÁRIO",x+315,y+7,corpoW-323,{negrito:true,tamanho:11,align:"center",cor:verdeTexto})
      texto(`${meses[Number(mes)]}/${ano} - ${via}`,x+315,y+24,corpoW-323,{negrito:true,tamanho:8,align:"center"})
      texto(`Cód.: ${funcionario.matricula||funcionario.id}`,x+8,y+42,70,{tamanho:7})
      texto(funcionario.nome,x+82,y+38,285,{negrito:true,tamanho:12})
      texto(`CBO: ${funcionario.cbo||"-"}`,x+372,y+42,82,{tamanho:7})
      texto(`Cargo: ${funcionario.cargo||"-"}`,x+457,y+42,corpoW-465,{tamanho:7})
      const itens=[...(folha.proventos||[]).map(item=>({item,desconto:false})),...(folha.descontos||[]).map(item=>({item,desconto:true}))]
      const tabY=y+headerH,cabH=19,linhaH=Math.min(14,(tabH-cabH-3)/Math.max(1,itens.length)),fonteLinha=Math.max(5.5,Math.min(7,linhaH-1.5)),col=[x,x+42,x+350,x+440,x+548,x+corpoW]
      caixa(x,tabY,corpoW,cabH,verdeCabecalho)
      ;["Cód.","Descrição","Referência","Vencimentos","Descontos"].forEach((v,i)=>texto(v,col[i]+3,tabY+6,col[i+1]-col[i]-6,{negrito:true,tamanho:6,align:i>1?"center":"left",cor:verdeTexto}))
      for(const px of col)doc.strokeColor(verdeLinha).moveTo(px,tabY).lineTo(px,tabY+tabH).stroke()
      let linha=0
      const imprimir=(item,desconto)=>{const iy=tabY+cabH+linhaH*linha++;texto(codigosHolerite[item.descricao]||"999",col[0]+4,iy+2,34,{tamanho:fonteLinha});texto(item.descricao,col[1]+4,iy+2,col[2]-col[1]-8,{negrito:true,tamanho:fonteLinha});texto(referencia(item),col[2]+3,iy+2,col[3]-col[2]-6,{tamanho:fonteLinha,align:"center"});texto(dinheiro(item.valor),(desconto?col[4]:col[3])+3,iy+2,(desconto?col[5]-col[4]:col[4]-col[3])-6,{tamanho:fonteLinha,align:"right"})}
      itens.forEach(({item,desconto})=>imprimir(item,desconto))
      const totaisY=tabY+tabH
      caixa(x,totaisY,corpoW,totH,verdeCabecalho)
      texto("Total de Vencimentos",x+350,totaisY+5,98,{tamanho:6,align:"center",cor:verdeTexto});texto("Total de Descontos",x+450,totaisY+5,98,{tamanho:6,align:"center",cor:verdeTexto});texto("Valor Líquido",x+550,totaisY+5,corpoW-550,{tamanho:6,align:"center",cor:verdeTexto})
      texto(dinheiro(folha.totalProventos),x+350,totaisY+18,98,{negrito:true,tamanho:9,align:"right"});texto(dinheiro(folha.totalDescontos),x+450,totaisY+18,98,{negrito:true,tamanho:9,align:"right"});texto(dinheiro(folha.liquido),x+550,totaisY+17,corpoW-550,{negrito:true,tamanho:10,align:"right"})
      const baseY=totaisY+totH,baseW=corpoW/5
      caixa(x,baseY,corpoW,baseH,verdeCabecalho)
      ;[["Salário Base",folha.salarioBase],["Sal. Contr. INSS",folha.baseInss],["Base Cálc. FGTS",folha.baseFgts],["FGTS do Mês",folha.fgts],["Base Cálc. IRRF",folha.baseIrrf]].forEach(([r,v],i)=>{texto(r,x+i*baseW+3,baseY+7,baseW-6,{tamanho:6,align:"center",cor:verdeTexto});texto(dinheiro(v),x+i*baseW+3,baseY+20,baseW-6,{negrito:true,tamanho:8,align:"center"})})
      texto(`CPF: ${funcionario.cpf||"-"}  |  PIS/NIT: ${funcionario.pisPasepNit||"-"}`,x+7,baseY+39,corpoW-14,{tamanho:6})
      const rx=x+corpoW;caixa(rx,y,assinaturaW,h,verdeCabecalho)
      doc.strokeColor(verdeTexto).moveTo(rx+15,y+104).lineTo(rx+assinaturaW-15,y+104).stroke();texto("ASSINATURA DO FUNCIONÁRIO",rx+8,y+111,assinaturaW-16,{tamanho:6,align:"center"})
      doc.strokeColor(verdeTexto).moveTo(rx+25,y+185).lineTo(rx+assinaturaW-25,y+185).stroke();texto("DATA",rx+8,y+192,assinaturaW-16,{tamanho:6,align:"center"})
    }
    desenharVia(20,"1ª VIA - EMPREGADOR")
    doc.save().dash(4,{space:3}).strokeColor("#819b86").moveTo(20,287).lineTo(822,287).stroke().restore()
    desenharVia(305,"2ª VIA - FUNCIONÁRIO")
    doc.end()
  } catch(e) { console.error(e); res.status(500).json({message:"Erro ao gerar holerite"}) }
})

module.exports = router

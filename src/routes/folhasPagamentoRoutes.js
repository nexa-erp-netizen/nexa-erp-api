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
    const x=20, y=20, w=802, h=555, reciboW=168, corpoW=w-reciboW
    const caixa=(cx,cy,cw,ch,fill=verdeFundo)=>doc.save().rect(cx,cy,cw,ch).fillAndStroke(fill,verdeLinha).restore()
    const texto=(t,tx,ty,tw,op={})=>doc.fillColor(op.cor||"#163b22").font(op.negrito?"Helvetica-Bold":"Helvetica").fontSize(op.tamanho||8).text(String(t??""),tx,ty,{width:tw,height:op.altura,align:op.align||"left",ellipsis:true})
    caixa(x,y,w,h)
    caixa(x,y,corpoW,66,verdeCabecalho)
    texto(cliente.nome||"EMPRESA",x+9,y+8,370,{negrito:true,tamanho:12})
    texto(`CNPJ/CPF: ${cliente.cnpj||cliente.cpf||"-"}`,x+9,y+25,370,{tamanho:9})
    texto("RECIBO DE PAGAMENTO DE SALÁRIO",x+385,y+8,corpoW-394,{negrito:true,tamanho:13,align:"center",cor:verdeTexto})
    const [ano,mes]=folha.competencia.split("-")
    const meses=["","JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"]
    texto(`${meses[Number(mes)]}/${ano}`,x+385,y+29,corpoW-394,{negrito:true,tamanho:10,align:"center"})
    texto(`Código: ${funcionario.matricula||funcionario.id}`,x+9,y+47,105,{tamanho:7})
    texto(`Funcionário: ${funcionario.nome}`,x+112,y+47,305,{negrito:true,tamanho:8})
    texto(`CBO: ${funcionario.cbo||"-"}`,x+420,y+47,85,{tamanho:7})
    texto(`Cargo: ${funcionario.cargo||"-"}`,x+505,y+47,corpoW-514,{tamanho:7})

    const tabY=y+66, cabH=24, linhaH=22, tabelaH=325
    const col=[x,x+48,x+342,x+435,x+534,x+corpoW]
    caixa(x,tabY,corpoW,cabH,verdeCabecalho)
    ;["Cód.","Descrição","Referência","Vencimentos","Descontos"].forEach((v,i)=>texto(v,col[i]+4,tabY+8,col[i+1]-col[i]-8,{negrito:true,tamanho:7,align:i>1?"center":"left",cor:verdeTexto}))
    for(const px of col) doc.strokeColor(verdeLinha).moveTo(px,tabY).lineTo(px,tabY+tabelaH).stroke()
    let linha=0
    const referencia=(item,desconto)=>{
      if(item.descricao==="Salário") return `${folha.diasTrabalhados||30} dias`
      if(item.descricao==="Horas extras 50%") return `${folha.horasExtras50||0} h`
      if(item.descricao==="Horas extras 100%") return `${folha.horasExtras100||0} h`
      if(item.descricao==="Faltas") return `${folha.faltasDias||0} dias`
      if(item.descricao==="Atrasos") return `${folha.atrasosHoras||0} h`
      if(item.descricao==="INSS") return "Tabela"
      if(item.descricao==="IRRF") return "Tabela"
      return desconto?"":"-"
    }
    const imprimirItem=(item,desconto=false)=>{const iy=tabY+cabH+linhaH*linha++;texto(codigosHolerite[item.descricao]||"999",col[0]+5,iy+7,38,{tamanho:8});texto(item.descricao,col[1]+5,iy+7,col[2]-col[1]-10,{negrito:true,tamanho:8});texto(referencia(item,desconto),col[2]+4,iy+7,col[3]-col[2]-8,{tamanho:8,align:"center"});if(desconto)texto(dinheiro(item.valor),col[4]+4,iy+7,col[5]-col[4]-8,{tamanho:8,align:"right"});else texto(dinheiro(item.valor),col[3]+4,iy+7,col[4]-col[3]-8,{tamanho:8,align:"right"})}
    ;(folha.proventos||[]).forEach(i=>imprimirItem(i,false));(folha.descontos||[]).forEach(i=>imprimirItem(i,true))

    const totaisY=tabY+tabelaH
    caixa(x,totaisY,corpoW,58,verdeCabecalho)
    texto("Total de Vencimentos",x+342,totaisY+7,95,{tamanho:7,align:"center",cor:verdeTexto});texto("Total de Descontos",x+437,totaisY+7,97,{tamanho:7,align:"center",cor:verdeTexto})
    texto(dinheiro(folha.totalProventos),x+342,totaisY+23,95,{negrito:true,tamanho:10,align:"right"});texto(dinheiro(folha.totalDescontos),x+437,totaisY+23,97,{negrito:true,tamanho:10,align:"right"})
    texto("Valor Líquido",x+342,totaisY+42,95,{negrito:true,tamanho:8,align:"center",cor:verdeTexto});texto(dinheiro(folha.liquido),x+437,totaisY+40,97,{negrito:true,tamanho:12,align:"right"})
    const baseY=totaisY+58, baseW=corpoW/5
    caixa(x,baseY,corpoW,86,verdeCabecalho)
    const bases=[["Salário Base",folha.salarioBase],["Sal. Contr. INSS",folha.baseInss],["Base Cálc. FGTS",folha.baseFgts],["FGTS do Mês",folha.fgts],["Base Cálc. IRRF",folha.baseIrrf]]
    bases.forEach(([rotulo,valor],i)=>{texto(rotulo,x+i*baseW+5,baseY+12,baseW-10,{tamanho:7,align:"center",cor:verdeTexto});texto(dinheiro(valor),x+i*baseW+5,baseY+33,baseW-10,{negrito:true,tamanho:9,align:"center"})})
    texto(`CPF: ${funcionario.cpf||"-"}  •  PIS/NIT: ${funcionario.pisPasepNit||"-"}`,x+8,baseY+62,corpoW-16,{tamanho:7})

    const rx=x+corpoW
    caixa(rx,y,reciboW,h,verdeCabecalho)
    texto("DECLARAÇÃO DE RECEBIMENTO",rx+12,y+14,reciboW-24,{negrito:true,tamanho:10,align:"center",cor:verdeTexto})
    texto("Declaro ter recebido a importância líquida discriminada neste recibo de pagamento.",rx+15,y+65,reciboW-30,{tamanho:9,align:"center"})
    texto(`Valor líquido\nR$ ${dinheiro(folha.liquido)}`,rx+15,y+150,reciboW-30,{negrito:true,tamanho:12,align:"center",cor:verdeTexto})
    doc.strokeColor(verdeTexto).moveTo(rx+20,y+350).lineTo(rx+reciboW-20,y+350).stroke()
    texto("ASSINATURA DO FUNCIONÁRIO",rx+12,y+357,reciboW-24,{tamanho:7,align:"center"})
    doc.strokeColor(verdeTexto).moveTo(rx+20,y+435).lineTo(rx+reciboW-20,y+435).stroke()
    texto("DATA",rx+12,y+442,reciboW-24,{tamanho:7,align:"center"})
    texto(`Documento gerado pela Nexa ERP • ${folha.status}`,rx+12,y+h-28,reciboW-24,{tamanho:6,align:"center",cor:verdeTexto})
    doc.end()
  } catch(e) { console.error(e); res.status(500).json({message:"Erro ao gerar holerite"}) }
})

module.exports = router

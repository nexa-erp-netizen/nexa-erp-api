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

router.post("/processar-lote",async(req,res)=>{try{const cliente=await Cliente.findByPk(req.body.clienteId);if(!cliente)return res.status(404).json({message:"Empresa não encontrada"});if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.body.competencia||"")))return res.status(400).json({message:"Competência inválida"});const funcionarios=await Funcionario.findAll({where:{clienteId:cliente.id,status:"Ativo"}}),resultados=[];for(const funcionario of funcionarios){const calculo=calcularFolha(funcionario.toJSON(),{diasTrabalhados:30}),entrada={clienteId:cliente.id,cliente:cliente.nome,funcionarioId:funcionario.id,funcionario:funcionario.nome,competencia:req.body.competencia,...calculo};camposEntrada.forEach(c=>entrada[c]=0);const[item,criada]=await Folha.findOrCreate({where:{funcionarioId:funcionario.id,competencia:req.body.competencia},defaults:entrada});if(!criada&&item.status!=="Fechada")await item.update(entrada);resultados.push(item)}res.json({processadas:resultados.length,folhas:resultados})}catch(e){console.error(e);res.status(500).json({message:"Erro ao processar folha consolidada"})}})

router.patch("/status-lote",async(req,res)=>{try{const status=req.body.status==="Fechada"?"Fechada":"Rascunho",[quantidade]=await Folha.update({status,fechadoEm:status==="Fechada"?new Date():null},{where:{clienteId:Number(req.body.clienteId),competencia:req.body.competencia}});res.json({quantidade,status})}catch(e){console.error(e);res.status(500).json({message:"Erro ao alterar fechamento consolidado"})}})

router.get("/resumo-pdf",async(req,res)=>{try{const cliente=await Cliente.findByPk(req.query.clienteId),folhas=cliente?await Folha.findAll({where:{clienteId:cliente.id,competencia:req.query.competencia},order:[["funcionario","ASC"]]}):[];if(!cliente||!folhas.length)return res.status(404).json({message:"Folha consolidada não encontrada"});const doc=new PDFDocument({size:"A4",layout:"portrait",margin:38}),partes=[];doc.on("data",p=>partes.push(p));doc.on("end",()=>{res.setHeader("Content-Type","application/pdf");res.setHeader("Content-Disposition",`attachment; filename=folha-consolidada-${req.query.competencia}.pdf`);res.send(Buffer.concat(partes))});doc.fillColor("#176b2d").font("Helvetica-Bold").fontSize(17).text("RESUMO DA FOLHA DE PAGAMENTO",{align:"center"}).moveDown(.4).fontSize(10).text(`${cliente.nome} · ${req.query.competencia}`,{align:"center"}).moveDown(1.5);const x=38,col=[x,x+210,x+295,x+380,x+465,557],y=doc.y;doc.rect(x,y,519,22).fillAndStroke("#bcebc2","#70bd7c");["Funcionário","Bruto","Descontos","Líquido","FGTS"].forEach((v,i)=>doc.fillColor("#173b2a").font("Helvetica-Bold").fontSize(7).text(v,col[i]+4,y+7,{width:col[i+1]-col[i]-8,align:i?"right":"left"}));let py=y+22;const totais={p:0,d:0,l:0,f:0};for(const f of folhas){if(py>760){doc.addPage();py=38}doc.rect(x,py,519,20).fillAndStroke("#e5f7e7","#70bd7c");const vals=[f.funcionario,dinheiro(f.totalProventos),dinheiro(f.totalDescontos),dinheiro(f.liquido),dinheiro(f.fgts)];vals.forEach((v,i)=>doc.fillColor("#173b2a").font(i?"Helvetica":"Helvetica-Bold").fontSize(7).text(v,col[i]+4,py+6,{width:col[i+1]-col[i]-8,align:i?"right":"left"}));py+=20;totais.p+=numero(f.totalProventos);totais.d+=numero(f.totalDescontos);totais.l+=numero(f.liquido);totais.f+=numero(f.fgts)}doc.rect(x,py,519,27).fillAndStroke("#bcebc2","#70bd7c");["TOTAIS",dinheiro(totais.p),dinheiro(totais.d),dinheiro(totais.l),dinheiro(totais.f)].forEach((v,i)=>doc.fillColor("#173b2a").font("Helvetica-Bold").fontSize(8).text(v,col[i]+4,py+9,{width:col[i+1]-col[i]-8,align:i?"right":"left"}));doc.moveDown(4).font("Helvetica").fontSize(7).text("Resumo gerencial. Os holerites individuais permanecem disponíveis para assinatura.");doc.end()}catch(e){console.error(e);res.status(500).json({message:"Erro ao gerar folha consolidada"})}})

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
    const doc = new PDFDocument({size:"A4",layout:"portrait",margin:20})
    const partes=[]; doc.on("data",p=>partes.push(p)); doc.on("end",()=>{ const pdf=Buffer.concat(partes); res.setHeader("Content-Type","application/pdf"); res.setHeader("Content-Disposition",`attachment; filename=holerite-${folha.competencia}-${funcionario.nome.replace(/[^a-z0-9]/gi,"-")}.pdf`); res.send(pdf) })
    const verdeFundo="#e5f7e7", verdeCabecalho="#bcebc2", verdeLinha="#70bd7c", verdeTexto="#176b2d"
    const caixa=(cx,cy,cw,ch,fill=verdeFundo)=>doc.save().rect(cx,cy,cw,ch).fillAndStroke(fill,verdeLinha).restore()
    const texto=(t,tx,ty,tw,op={})=>doc.fillColor(op.cor||"#163b22").font(op.negrito?"Helvetica-Bold":"Helvetica").fontSize(op.tamanho||8).text(String(t??""),tx,ty,{width:tw,height:op.altura||14,align:op.align||"left",ellipsis:true,lineBreak:false})
    const textoVertical=(t,tx,ty,altura,op={})=>doc.save().translate(tx,ty+altura).rotate(-90).fillColor(op.cor||"#163b22").font(op.negrito?"Helvetica-Bold":"Helvetica").fontSize(op.tamanho||6).text(String(t??""),0,0,{width:altura,align:op.align||"center",lineBreak:false}).restore()
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
      const x=24,w=547,h=370,assinaturaW=68,corpoW=w-assinaturaW,headerH=67,tabH=190,totH=43,baseH=70
      caixa(x,y,w,h); caixa(x,y,corpoW,headerH,verdeCabecalho)
      texto(cliente.nome||"EMPRESA",x+7,y+7,225,{negrito:true,tamanho:9})
      texto(`CNPJ/CPF: ${cliente.cnpj||cliente.cpf||"-"}`,x+7,y+22,225,{tamanho:6})
      texto("RECIBO DE PAGAMENTO DE SALÁRIO",x+235,y+7,corpoW-242,{negrito:true,tamanho:9,align:"center",cor:verdeTexto})
      texto(`${meses[Number(mes)]}/${ano}`,x+235,y+22,corpoW-242,{negrito:true,tamanho:7,align:"center"})
      texto(via,x+235,y+34,corpoW-242,{negrito:true,tamanho:6,align:"center",cor:verdeTexto})
      texto(`Cód.: ${funcionario.matricula||funcionario.id}`,x+7,y+49,55,{tamanho:6})
      texto(funcionario.nome,x+65,y+45,245,{negrito:true,tamanho:11})
      texto(`CBO: ${funcionario.cbo||"-"}`,x+313,y+49,68,{tamanho:6})
      texto(`Cargo: ${funcionario.cargo||"-"}`,x+383,y+49,corpoW-390,{tamanho:6})
      const itens=[...(folha.proventos||[]).map(item=>({item,desconto:false})),...(folha.descontos||[]).map(item=>({item,desconto:true}))]
      const tabY=y+headerH,cabH=19,linhaH=Math.min(15,(tabH-cabH-3)/Math.max(1,itens.length)),fonteLinha=Math.max(5.5,Math.min(7,linhaH-1.5)),col=[x,x+38,x+272,x+343,x+411,x+corpoW]
      caixa(x,tabY,corpoW,cabH,verdeCabecalho)
      ;["Cód.","Descrição","Referência","Vencimentos","Descontos"].forEach((v,i)=>texto(v,col[i]+3,tabY+6,col[i+1]-col[i]-6,{negrito:true,tamanho:6,align:i>1?"center":"left",cor:verdeTexto}))
      for(const px of col)doc.strokeColor(verdeLinha).moveTo(px,tabY).lineTo(px,tabY+tabH).stroke()
      let linha=0
      const imprimir=(item,desconto)=>{const iy=tabY+cabH+linhaH*linha++;texto(codigosHolerite[item.descricao]||"999",col[0]+4,iy+2,34,{tamanho:fonteLinha});texto(item.descricao,col[1]+4,iy+2,col[2]-col[1]-8,{negrito:true,tamanho:fonteLinha});texto(referencia(item),col[2]+3,iy+2,col[3]-col[2]-6,{tamanho:fonteLinha,align:"center"});texto(dinheiro(item.valor),(desconto?col[4]:col[3])+3,iy+2,(desconto?col[5]-col[4]:col[4]-col[3])-6,{tamanho:fonteLinha,align:"right"})}
      itens.forEach(({item,desconto})=>imprimir(item,desconto))
      const totaisY=tabY+tabH
      caixa(x,totaisY,corpoW,totH,verdeCabecalho)
      texto("Total de Vencimentos",x+272,totaisY+6,68,{tamanho:5.5,align:"center",cor:verdeTexto});texto("Total de Descontos",x+343,totaisY+6,68,{tamanho:5.5,align:"center",cor:verdeTexto});texto("Valor Líquido",x+414,totaisY+6,corpoW-417,{tamanho:5.5,align:"center",cor:verdeTexto})
      texto(dinheiro(folha.totalProventos),x+272,totaisY+21,68,{negrito:true,tamanho:8,align:"right"});texto(dinheiro(folha.totalDescontos),x+343,totaisY+21,68,{negrito:true,tamanho:8,align:"right"});texto(dinheiro(folha.liquido),x+414,totaisY+20,corpoW-417,{negrito:true,tamanho:9,align:"right"})
      const baseY=totaisY+totH,baseW=corpoW/5
      caixa(x,baseY,corpoW,baseH,verdeCabecalho)
      ;[["Salário Base",folha.salarioBase],["Sal. Contr. INSS",folha.baseInss],["Base Cálc. FGTS",folha.baseFgts],["FGTS do Mês",folha.fgts],["Base Cálc. IRRF",folha.baseIrrf]].forEach(([r,v],i)=>{texto(r,x+i*baseW+2,baseY+9,baseW-4,{tamanho:5.5,align:"center",cor:verdeTexto});texto(dinheiro(v),x+i*baseW+2,baseY+25,baseW-4,{negrito:true,tamanho:7.5,align:"center"})})
      texto(`CPF: ${funcionario.cpf||"-"}  |  PIS/NIT: ${funcionario.pisPasepNit||"-"}`,x+7,baseY+50,corpoW-14,{tamanho:5.5})
      const rx=x+corpoW;caixa(rx,y,assinaturaW,h,verdeCabecalho)
      doc.strokeColor(verdeTexto).moveTo(rx+24,y+25).lineTo(rx+24,y+238).stroke()
      textoVertical("ASSINATURA DO FUNCIONÁRIO",rx+7,y+25,213,{tamanho:6,negrito:true})
      doc.strokeColor(verdeTexto).moveTo(rx+49,y+25).lineTo(rx+49,y+238).stroke()
      textoVertical("ASSINE ENTRE AS LINHAS",rx+32,y+25,213,{tamanho:5.5})
      textoVertical("DATA: ____/____/________",rx+32,y+250,100,{tamanho:6,negrito:true})
    }
    desenharVia(28,"1ª VIA - EMPREGADOR")
    doc.save().dash(4,{space:3}).strokeColor("#819b86").moveTo(24,421).lineTo(571,421).stroke().restore()
    desenharVia(444,"2ª VIA - FUNCIONÁRIO")
    doc.end()
  } catch(e) { console.error(e); res.status(500).json({message:"Erro ao gerar holerite"}) }
})

module.exports = router

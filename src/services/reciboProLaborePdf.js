const PDFDocument = require("pdfkit")
const n=v=>Number(v||0)
const dinheiro=v=>n(v).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})

function gerarReciboProLabore(pro,socio,cliente) {
  const doc=new PDFDocument({size:"A4",layout:"portrait",margin:20}),partes=[]
  doc.on("data",p=>partes.push(p))
  const concluido=new Promise(resolve=>doc.on("end",()=>resolve(Buffer.concat(partes))))
  const fundo="#e5f7e7",cab="#bcebc2",linha="#70bd7c",cor="#176b2d"
  const caixa=(x,y,w,h,f=fundo)=>doc.save().rect(x,y,w,h).fillAndStroke(f,linha).restore()
  const texto=(t,x,y,w,o={})=>doc.fillColor(o.cor||"#163b22").font(o.b?"Helvetica-Bold":"Helvetica").fontSize(o.s||8).text(String(t??""),x,y,{width:w,height:o.h||14,align:o.a||"left",ellipsis:true,lineBreak:false})
  const vertical=(t,x,y,h,o={})=>doc.save().translate(x,y+h).rotate(-90).fillColor(o.cor||"#163b22").font(o.b?"Helvetica-Bold":"Helvetica").fontSize(o.s||6).text(t,0,0,{width:h,align:"center",lineBreak:false}).restore()
  const [ano,mes]=pro.competencia.split("-"),meses=["","JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"]
  const pct=(v,b)=>b>0?`${(n(v)/n(b)*100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}%`:"0,00%"
  const ref=i=>i.descricao==="INSS"?pct(pro.inss,pro.baseInss):i.descricao==="IRRF"?pct(pro.irrf,pro.baseIrrf):"Mensal"
  const via=(y,rotulo)=>{
    const x=24,w=547,h=370,sig=68,body=w-sig,header=67,tab=190,tot=43,base=70
    caixa(x,y,w,h);caixa(x,y,body,header,cab)
    texto(cliente.nome||"EMPRESA",x+7,y+7,225,{b:true,s:9});texto(`CNPJ/CPF: ${cliente.cnpj||cliente.cpf||"-"}`,x+7,y+22,225,{s:6})
    texto("RECIBO DE PAGAMENTO DE PRÓ-LABORE",x+225,y+7,body-232,{b:true,s:8.5,a:"center",cor});texto(`${meses[Number(mes)]}/${ano}`,x+235,y+22,body-242,{b:true,s:7,a:"center"});texto(rotulo,x+235,y+34,body-242,{b:true,s:6,a:"center",cor})
    texto(`Cód.: ${socio.id}`,x+7,y+49,55,{s:6});texto(socio.nome,x+65,y+45,245,{b:true,s:11});texto(`NIT/PIS: ${socio.nisNitPis||"-"}`,x+313,y+49,86,{s:6});texto(socio.qualificacao||"Sócio",x+402,y+49,body-409,{s:6})
    const itens=[...(pro.proventos||[]).map(item=>({item,d:false})),...(pro.descontos||[]).map(item=>({item,d:true}))],ty=y+header,ch=19,rh=Math.min(15,(tab-ch-3)/Math.max(1,itens.length)),fs=Math.max(5.5,Math.min(7,rh-1.5)),cols=[x,x+38,x+272,x+343,x+411,x+body]
    caixa(x,ty,body,ch,cab);["Cód.","Descrição","Referência","Proventos","Descontos"].forEach((v,i)=>texto(v,cols[i]+3,ty+6,cols[i+1]-cols[i]-6,{b:true,s:6,a:i>1?"center":"left",cor}));for(const p of cols)doc.strokeColor(linha).moveTo(p,ty).lineTo(p,ty+tab).stroke()
    let l=0;for(const {item,d} of itens){const iy=ty+ch+rh*l++,codigo=item.descricao==="Pró-labore"?"001":item.descricao==="INSS"?"973":item.descricao==="IRRF"?"987":"999";texto(codigo,cols[0]+4,iy+2,30,{s:fs});texto(item.descricao,cols[1]+4,iy+2,cols[2]-cols[1]-8,{b:true,s:fs});texto(ref(item),cols[2]+3,iy+2,cols[3]-cols[2]-6,{s:fs,a:"center"});texto(dinheiro(item.valor),(d?cols[4]:cols[3])+3,iy+2,(d?cols[5]-cols[4]:cols[4]-cols[3])-6,{s:fs,a:"right"})}
    const tY=ty+tab;caixa(x,tY,body,tot,cab);texto("Total de Proventos",x+272,tY+6,68,{s:5.5,a:"center",cor});texto("Total de Descontos",x+343,tY+6,68,{s:5.5,a:"center",cor});texto("Valor Líquido",x+414,tY+6,body-417,{s:5.5,a:"center",cor});texto(dinheiro(pro.totalProventos),x+272,tY+21,68,{b:true,s:8,a:"right"});texto(dinheiro(pro.totalDescontos),x+343,tY+21,68,{b:true,s:8,a:"right"});texto(dinheiro(pro.liquido),x+414,tY+20,body-417,{b:true,s:9,a:"right"})
    const bY=tY+tot,bw=body/4;caixa(x,bY,body,base,cab);[["Pró-labore Base",pro.valorBruto],["Base INSS",pro.baseInss],["INSS Retido",pro.inss],["Base IRRF",pro.baseIrrf]].forEach(([r,v],i)=>{texto(r,x+i*bw+2,bY+9,bw-4,{s:5.5,a:"center",cor});texto(dinheiro(v),x+i*bw+2,bY+25,bw-4,{b:true,s:7.5,a:"center"})});texto(`CPF: ${socio.cpf||"-"}  |  NIT/PIS: ${socio.nisNitPis||"-"}  |  Sem incidência de FGTS`,x+7,bY+50,body-14,{s:5.5})
    const rx=x+body;caixa(rx,y,sig,h,cab);doc.strokeColor(cor).moveTo(rx+24,y+25).lineTo(rx+24,y+238).stroke();vertical("ASSINATURA DO SÓCIO",rx+7,y+25,213,{s:6,b:true});doc.moveTo(rx+49,y+25).lineTo(rx+49,y+238).stroke();vertical("ASSINE ENTRE AS LINHAS",rx+32,y+25,213,{s:5.5});vertical("DATA: ____/____/________",rx+32,y+250,100,{s:6,b:true})
  }
  via(28,"1ª VIA - EMPRESA");doc.save().dash(4,{space:3}).strokeColor("#819b86").moveTo(24,421).lineTo(571,421).stroke().restore();via(444,"2ª VIA - SÓCIO");doc.end()
  return concluido
}
module.exports={gerarReciboProLabore}

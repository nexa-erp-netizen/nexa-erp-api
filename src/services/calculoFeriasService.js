const { calcularInss, calcularIrrf, TABELA_2026 } = require("./calculoFolhaService")
const n=v=>Number(v||0), r=v=>Math.max(0,Math.round((n(v)+Number.EPSILON)*100)/100)
const data=s=>new Date(`${s}T12:00:00`), iso=d=>d.toISOString().slice(0,10)
function somarAnos(s,anos){const d=data(s);d.setFullYear(d.getFullYear()+anos);return iso(d)}
function somarDias(s,dias){const d=data(s);d.setDate(d.getDate()+dias);return iso(d)}
function diasDireito(faltas){faltas=Math.max(0,Math.trunc(n(faltas)));if(faltas<=5)return 30;if(faltas<=14)return 24;if(faltas<=23)return 18;if(faltas<=32)return 12;return 0}
function periodoPorAdmissao(admissao,referencia=new Date()) {let inicio=data(admissao);while(true){const proxInicio=somarAnos(iso(inicio),1),proxFim=somarDias(somarAnos(proxInicio,1),-1);if(data(proxFim)>referencia)break;inicio=data(proxInicio)}const inicioIso=iso(inicio),fim=somarDias(somarAnos(inicioIso,1),-1);return {inicio:inicioIso,fim,concessivoFim:somarAnos(fim,1)}}
function calcularFerias(funcionario,e={}){
 const faltas=Math.max(0,Math.trunc(n(e.faltasInjustificadas))),direito=diasDireito(faltas),dias=Math.max(1,Math.min(direito,Math.trunc(n(e.diasFerias)||direito))),abono=Math.max(0,Math.min(10,Math.trunc(n(e.diasAbono))))
 if(!direito)throw new Error("O número de faltas informado elimina o direito a férias neste período.")
 if(dias+abono>direito)throw new Error(`Férias e abono não podem ultrapassar ${direito} dias de direito.`)
 const salario=r(e.salarioBase??funcionario.salarioBase),media=r(e.mediaVariaveis),adicionais=r(e.adicionaisFixos),remuneracao=r(salario+media+adicionais)
 const valorFerias=r(remuneracao/30*dias),tercoFerias=r(valorFerias/3),abonoPecuniario=r(remuneracao/30*abono),tercoAbono=r(abonoPecuniario/3),adiantamentoDecimo=e.adiantarDecimo?r(remuneracao/2):0,outrosProventos=r(e.outrosProventos)
 const baseInss=r(valorFerias+tercoFerias+outrosProventos),inss=calcularInss(baseInss),dependentes=(funcionario.dependentes||[]).filter(d=>d.irrf).length,pensao=r(e.pensaoAlimenticia),ir=calcularIrrf(baseInss,inss,dependentes,pensao),outrosDescontos=r(e.outrosDescontos)
 const proventos=[[`Férias gozadas (${dias} dias)`,valorFerias],["1/3 constitucional de férias",tercoFerias],[`Abono pecuniário (${abono} dias)`,abonoPecuniario],["1/3 sobre abono pecuniário",tercoAbono],["Adiantamento da 1ª parcela do 13º",adiantamentoDecimo],["Outros proventos",outrosProventos]].filter(([,v])=>v>0).map(([descricao,valor])=>({descricao,valor}))
 const descontos=[["INSS",inss],["IRRF",ir.imposto],["Pensão alimentícia",pensao],["Outros descontos",outrosDescontos]].filter(([,v])=>v>0).map(([descricao,valor])=>({descricao,valor}))
 const totalProventos=r(proventos.reduce((s,i)=>s+i.valor,0)),totalDescontos=r(descontos.reduce((s,i)=>s+i.valor,0)),inicio=e.inicioFerias,fim=inicio?somarDias(inicio,dias-1):null,periodo=e.periodoAquisitivoInicio?{inicio:e.periodoAquisitivoInicio,fim:e.periodoAquisitivoFim||somarDias(somarAnos(e.periodoAquisitivoInicio,1),-1),concessivoFim:e.periodoConcessivoFim||somarAnos(e.periodoAquisitivoFim||somarDias(somarAnos(e.periodoAquisitivoInicio,1),-1),1)}:periodoPorAdmissao(funcionario.dataAdmissao)
 return {periodoAquisitivoInicio:periodo.inicio,periodoAquisitivoFim:periodo.fim,periodoConcessivoFim:periodo.concessivoFim,inicioFerias:inicio,fimFerias:fim,diasFerias:dias,diasAbono:abono,faltasInjustificadas:faltas,salarioBase:salario,mediaVariaveis:media,adicionaisFixos:adicionais,valorFerias,tercoFerias,abonoPecuniario,tercoAbono,adiantamentoDecimo,baseInss,inss,baseIrrf:ir.base,irrf:ir.imposto,outrosProventos,outrosDescontos,pensaoAlimenticia:pensao,totalProventos,totalDescontos,liquido:r(totalProventos-totalDescontos),proventos,descontos,tabelaCalculo:{vigencia:TABELA_2026.vigencia,diasDireito:direito}}
}
module.exports={calcularFerias,diasDireito,periodoPorAdmissao}

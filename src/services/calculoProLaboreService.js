const { calcularIrrf, TABELA_2026 } = require("./calculoFolhaService")
const numero = v => Number(v || 0)
const arredondar = v => Math.max(0, Math.round((numero(v) + Number.EPSILON) * 100) / 100)

function calcularProLabore(socio, entrada = {}) {
  const valorBruto = arredondar(entrada.valorBruto ?? socio.valorProLabore)
  const outrosProventos = arredondar(entrada.outrosProventos)
  const remuneracao = arredondar(valorBruto + outrosProventos)
  const outrosVinculos = arredondar(entrada.contribuicaoOutrosVinculos ?? socio.contribuicaoOutrosVinculos)
  const tetoContribuicao = arredondar(TABELA_2026.inss.at(-1)[0] * 0.11)
  const inss = arredondar(Math.min(remuneracao * 0.11, Math.max(0, tetoContribuicao - outrosVinculos)))
  const dependentesIrrf = Math.max(0, Math.trunc(numero(entrada.dependentesIrrf ?? socio.dependentesIrrf)))
  const pensao = arredondar(entrada.pensaoAlimenticia)
  const irrfInfo = calcularIrrf(remuneracao, inss, dependentesIrrf, pensao)
  const outrosDescontos = arredondar(entrada.outrosDescontos)
  const proventos = [["Pró-labore", valorBruto], ["Outros proventos", outrosProventos]].filter(([,v])=>v>0).map(([descricao,valor])=>({descricao,valor}))
  const descontos = [["INSS",inss],["IRRF",irrfInfo.imposto],["Pensão alimentícia",pensao],["Outros descontos",outrosDescontos]].filter(([,v])=>v>0).map(([descricao,valor])=>({descricao,valor}))
  const totalProventos = arredondar(proventos.reduce((s,i)=>s+i.valor,0))
  const totalDescontos = arredondar(descontos.reduce((s,i)=>s+i.valor,0))
  return { valorBruto, outrosProventos, outrosDescontos, pensaoAlimenticia:pensao, contribuicaoOutrosVinculos:outrosVinculos, dependentesIrrf, baseInss:remuneracao, inss, baseIrrf:irrfInfo.base, irrf:irrfInfo.imposto, totalProventos, totalDescontos, liquido:arredondar(totalProventos-totalDescontos), proventos, descontos, tabelaCalculo:{vigencia:TABELA_2026.vigencia,inssSocio:0.11,tetoContribuicao,irrf:TABELA_2026.irrf,dependenteIrrf:TABELA_2026.dependenteIrrf,descontoSimplificado:TABELA_2026.descontoSimplificado} }
}

module.exports = { calcularProLabore }

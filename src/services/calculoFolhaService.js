const TABELA_2026 = {
  vigencia: "2026-01",
  inss: [[1621, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]],
  irrf: [[2428.8, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]],
  dependenteIrrf: 189.59,
  descontoSimplificado: 607.20,
  reducaoAte5000: 312.89,
  reducaoLimite: 7350,
  salarioFamiliaLimite: 1980.38,
  salarioFamiliaCota: 67.54,
  fgts: 0.08,
}

const n = (v) => Number(v || 0)
const r = (v) => Math.max(0, Math.round((n(v) + Number.EPSILON) * 100) / 100)

function calcularInss(base) {
  base = Math.min(r(base), 8475.55)
  let anterior = 0
  let total = 0
  for (const [limite, aliquota] of TABELA_2026.inss) {
    const faixa = Math.max(0, Math.min(base, limite) - anterior)
    total += faixa * aliquota
    anterior = limite
    if (base <= limite) break
  }
  return r(total)
}

function calcularIrrf(rendimento, inss, dependentes, pensao = 0) {
  const deducoesLegais = r(inss + n(dependentes) * TABELA_2026.dependenteIrrf + n(pensao))
  const deducao = Math.max(deducoesLegais, TABELA_2026.descontoSimplificado)
  const base = r(Math.max(0, rendimento - deducao))
  const faixa = TABELA_2026.irrf.find(([limite]) => base <= limite)
  let imposto = r(base * faixa[1] - faixa[2])
  let reducao = 0
  if (rendimento <= 5000) reducao = Math.min(imposto, TABELA_2026.reducaoAte5000)
  else if (rendimento <= TABELA_2026.reducaoLimite) reducao = Math.max(0, 978.62 - 0.133145 * rendimento)
  imposto = r(Math.max(0, imposto - reducao))
  return { base, imposto, deducaoUsada: r(deducao), reducao: r(reducao) }
}

function calcularFolha(funcionario, entrada = {}) {
  const salarioBase = n(entrada.salarioBase ?? funcionario.salarioBase)
  const diasInformados = entrada.diasTrabalhados === "" || entrada.diasTrabalhados === null || entrada.diasTrabalhados === undefined ? 30 : n(entrada.diasTrabalhados)
  const dias = Math.min(30, Math.max(0, diasInformados))
  const salarioMensal = r(salarioBase / 30 * dias)
  const divisor = n(funcionario.jornadaSemanal) <= 36 ? 180 : 220
  const hora = salarioBase / divisor
  const extras50 = r(hora * 1.5 * n(entrada.horasExtras50))
  const extras100 = r(hora * 2 * n(entrada.horasExtras100))
  const insalubridade = r(salarioBase * n(funcionario.insalubridadePercentual) / 100)
  const periculosidade = funcionario.periculosidade ? r(salarioBase * 0.3) : 0
  const comissoes = r(entrada.comissoes)
  const bonus = r(entrada.bonus)
  const outrosProventos = r(entrada.outrosProventos)
  const faltas = r(salarioBase / 30 * n(entrada.faltasDias))
  const atrasos = r(hora * n(entrada.atrasosHoras))
  // Faltas e atrasos reduzem a remuneração tributável do mês; mantê-los apenas
  // como desconto faria INSS, IRRF e FGTS incidirem sobre valor não recebido.
  const remuneracaoBruta = r(salarioMensal + extras50 + extras100 + insalubridade + periculosidade + comissoes + bonus + outrosProventos)
  const baseInss = r(Math.max(0, remuneracaoBruta - faltas - atrasos))
  const inss = calcularInss(baseInss)
  const dependentesIrrf = (funcionario.dependentes || []).filter((d) => d.irrf).length
  const dependentesFamilia = (funcionario.dependentes || []).filter((d) => d.salarioFamilia).length
  const pensao = r(entrada.pensaoAlimenticia)
  const irrfInfo = calcularIrrf(baseInss, inss, dependentesIrrf, pensao)
  const salarioFamilia = baseInss <= TABELA_2026.salarioFamiliaLimite ? r(dependentesFamilia * TABELA_2026.salarioFamiliaCota) : 0
  const vt = r(entrada.descontoValeTransporte)
  const va = r(entrada.descontoValeAlimentacao)
  const outrosDescontos = r(entrada.outrosDescontos)
  const proventos = [
    ["Salário", salarioMensal], ["Horas extras 50%", extras50], ["Horas extras 100%", extras100], ["Insalubridade", insalubridade], ["Periculosidade", periculosidade], ["Comissões", comissoes], ["Bônus", bonus], ["Outros proventos", outrosProventos], ["Salário-família", salarioFamilia],
  ].filter(([, valor]) => valor > 0).map(([descricao, valor]) => ({ descricao, valor }))
  const descontos = [["Faltas", faltas], ["Atrasos", atrasos], ["INSS", inss], ["IRRF", irrfInfo.imposto], ["Vale-transporte", vt], ["Vale-alimentação", va], ["Pensão alimentícia", pensao], ["Outros descontos", outrosDescontos]].filter(([, valor]) => valor > 0).map(([descricao, valor]) => ({ descricao, valor }))
  const totalProventos = r(proventos.reduce((s, i) => s + i.valor, 0))
  const totalDescontos = r(descontos.reduce((s, i) => s + i.valor, 0))
  return { salarioBase, diasTrabalhados: dias, proventos, descontos, totalProventos, totalDescontos, liquido: r(totalProventos - totalDescontos), baseInss, inss, baseIrrf: irrfInfo.base, irrf: irrfInfo.imposto, baseFgts: baseInss, fgts: funcionario.optanteFgts ? r(baseInss * TABELA_2026.fgts) : 0, salarioFamilia, tabelaCalculo: TABELA_2026 }
}

module.exports = { calcularFolha, calcularInss, calcularIrrf, TABELA_2026 }

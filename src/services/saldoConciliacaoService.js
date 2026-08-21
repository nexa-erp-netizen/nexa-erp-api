function numero(valor) {
  const convertido = Number(valor || 0)
  return Number.isFinite(convertido) ? convertido : 0
}

function dataIso(valor) {
  const texto = String(valor || "").slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null
}

function movimentoPertenceAoSaldoAnterior(movimento, inicioCompetencia, dataSaldoInicial = null) {
  const data = dataIso(movimento?.data)
  const inicio = dataIso(inicioCompetencia)
  const marco = dataIso(dataSaldoInicial)
  if (!data || !inicio || data >= inicio) return false
  return !marco || data >= marco
}

function calcularSaldoAnterior({ saldoInicial = 0, dataSaldoInicial = null, inicioCompetencia, movimentos = [] }) {
  const considerados = movimentos.filter((item) =>
    movimentoPertenceAoSaldoAnterior(item, inicioCompetencia, dataSaldoInicial)
  )
  const anterioresAoMarco = dataIso(dataSaldoInicial)
    ? movimentos.filter((item) => {
      const data = dataIso(item?.data)
      return data && data < dataIso(dataSaldoInicial)
    })
    : []
  const variacaoAnterior = considerados.reduce((total, item) => total + numero(item.valorAssinado), 0)

  return {
    saldoAnterior: numero(saldoInicial) + variacaoAnterior,
    saldoInicial: numero(saldoInicial),
    variacaoAnterior,
    movimentosConsiderados: considerados,
    movimentosAnterioresAoMarco: anterioresAoMarco,
    dataSaldoInicial: dataIso(dataSaldoInicial),
  }
}

function diagnosticarSaldoAnterior(entrada) {
  const resultado = calcularSaldoAnterior(entrada)
  const inconsistente = resultado.movimentosAnterioresAoMarco.length > 0
  return {
    ...resultado,
    inconsistente,
    causaProvavel: inconsistente
      ? "Existem movimentos anteriores à data de início do controle desta conta. Eles permanecem preservados, mas não podem compor o saldo anterior."
      : "O saldo anterior foi formado pelo saldo inicial cadastrado e pelos movimentos válidos entre a data de início do controle e a competência consultada.",
    prevencaoAtiva: Boolean(resultado.dataSaldoInicial),
  }
}

module.exports = {
  calcularSaldoAnterior,
  diagnosticarSaldoAnterior,
  movimentoPertenceAoSaldoAnterior,
}

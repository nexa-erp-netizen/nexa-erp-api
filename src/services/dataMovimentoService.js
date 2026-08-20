function partesData(valor) {
  const achou = String(valor || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!achou) return null
  return { ano: Number(achou[1]), mes: Number(achou[2]), dia: Number(achou[3]) }
}

function dataCalendarioValida(ano, mes, dia) {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
}

function formatarData(ano, mes, dia) {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

function normalizarDataMovimento(valor, anoAtual = new Date().getFullYear()) {
  const partes = partesData(valor)
  if (!partes || !dataCalendarioValida(partes.ano, partes.mes, partes.dia)) {
    return { valida: false, corrigida: false, data: null }
  }

  if (partes.ano >= 1900 && partes.ano <= anoAtual + 1) {
    return { valida: true, corrigida: false, data: formatarData(partes.ano, partes.mes, partes.dia) }
  }

  // Erro legado observado: o navegador gravou 226 como 0226.
  // Só corrige quando os dois últimos dígitos formam um ano recente plausível.
  if (partes.ano >= 0 && partes.ano < 1000) {
    const anoCandidato = Math.floor(anoAtual / 100) * 100 + (partes.ano % 100)
    if (anoCandidato >= anoAtual - 10 && anoCandidato <= anoAtual + 1) {
      return { valida: true, corrigida: true, data: formatarData(anoCandidato, partes.mes, partes.dia) }
    }
  }

  return { valida: false, corrigida: false, data: null }
}

function competenciaDaData(valor, anoAtual = new Date().getFullYear()) {
  const resultado = normalizarDataMovimento(valor, anoAtual)
  if (!resultado.valida) return null
  const [ano, mes] = resultado.data.split("-")
  return `${mes}/${ano}`
}

module.exports = { normalizarDataMovimento, competenciaDaData }

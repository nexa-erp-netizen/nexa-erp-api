const MESES = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function extrairCompetencia(mensagem) {
  const texto = normalizar(mensagem)
  let ano
  let mes
  let achou = texto.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/)
  if (achou) [, ano, mes] = achou
  if (!achou) {
    achou = texto.match(/\b(0?[1-9]|1[0-2])\/(20\d{2})\b/)
    if (achou) [, mes, ano] = achou
  }
  if (!achou) {
    achou = texto.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de)?\s+(20\d{2})\b/)
    if (achou) {
      mes = MESES[achou[1]]
      ano = achou[2]
    }
  }
  if (!ano || !mes) return null
  const competencia = `${ano}-${String(Number(mes)).padStart(2, "0")}`
  return { competencia, dataInicio: `${competencia}-01` }
}

function identificarEscopo(mensagem) {
  const texto = normalizar(mensagem)
  if (/(processo real|desenquadramento real|no governo|portal do simples|receita federal|gov\.br)/.test(texto)) return "processo-real"
  if (/(somente|apenas|so)\s+(?:atualizar|alterar|mudar)?.{0,25}(?:nexa|cadastro|sistema)|cadastro interno|apenas na nexa|somente na nexa/.test(texto)) return "cadastro-interno"
  return null
}

function respostaConfirmaExecucao(valor) {
  return /^(sim|confirmo|confirmar|confirmado|pode confirmar|pode executar|pode salvar|salvar|execute|executar)$/.test(normalizar(valor))
}

function respostaCancelaExecucao(valor) {
  return /^(nao|cancelar|cancele|cancela|desistir|desisto|parar|pare)$/.test(normalizar(valor))
}

module.exports = {
  extrairCompetencia,
  identificarEscopo,
  normalizar,
  respostaConfirmaExecucao,
  respostaCancelaExecucao,
}

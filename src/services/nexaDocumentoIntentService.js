function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function parecePerguntaSobreDocumento(mensagem) {
  const texto = normalizar(mensagem)
  if (!texto) return false

  // Mencionar "documento" dentro de uma proibição não autoriza recuperar o
  // último PDF. Ex.: "não analise documentos; consulte somente o banco".
  const rejeitaDocumento = /\b(nao|nem|sem)\b.{0,45}\b(ler|leia|analisar|analise|consultar|consulte|usar|use|considerar|considere|buscar|busque)\w*\b.{0,35}\b(documento|arquivo|pdf|docx|anexo)s?\b/.test(texto)
    || /\b(somente|apenas)\b.{0,35}\b(banco de dados|erp|cadastro|financeiro|fiscal|movimentos?|lancamentos?|honorarios?)\b/.test(texto)
  if (rejeitaDocumento) return false

  // A consulta documental deve ser explícita na mensagem atual. Perguntas
  // genéricas não podem herdar silenciosamente um documento antigo.
  const alvo = "(documento|arquivo|pdf|docx|contrato|planilha|anexo)s?"
  const acao = "(ler|leia|analisar|analise|resumir|resuma|explicar|explique|extrair|extraia|interpretar|interprete)\\w*"
  return new RegExp(`\\b${acao}\\b.{0,55}\\b${alvo}\\b`).test(texto)
    || new RegExp(`\\b${alvo}\\b.{0,55}\\b${acao}\\b`).test(texto)
    || /\b(esse|esta|este|essa|nesse|nesta|neste|nessa|desse|desta|deste|dessa)\s+(documento|arquivo|pdf|contrato|anexo)\b/.test(texto)
    || /\b(nele|nela)\b/.test(texto)
}

module.exports = { parecePerguntaSobreDocumento }

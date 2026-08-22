function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function proibeAlteracao(mensagem) {
  const texto = normalizar(mensagem)
  if (!texto) return false
  return /\b(nao|nunca|jamais|sem)\b.{0,45}\b(altere|alterar|atualize|atualizar|mude|mudar|troque|trocar|corrija|corrigir|ajuste|ajustar|exclua|excluir|apague|apagar|salve|salvar|execute|executar)\b/.test(texto)
    || /\b(somente|apenas|so)\b.{0,30}\b(consult|analis|verific|listar|leitura)\w*\b/.test(texto)
    || /\b(nenhuma|nenhum)\s+(alteracao|correcao|exclusao|mudanca)\b/.test(texto)
}

module.exports = { proibeAlteracao }

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function financeiroAbertoParaPrioridade(item) {
  const status = normalizar(item?.status)
  const texto = [
    item?.descricao,
    item?.tipo,
    item?.origem,
    item?.referenciaOrigem,
    item?.centroCusto,
    item?.formaPagamento,
  ].map(normalizar).join(" ")

  if (!/(pendente|em aberto|a receber|aguardando|vencid|atrasad)/.test(status)) return false
  if (/(recebid|pago|quitad|realizad|confirmad|baixad|conciliad)/.test(status)) return false
  if (/(receita bruta mensal|pagamento confirmado|movimento cliente|lancamento contabil)/.test(texto)) return false
  return true
}

function movimentoContabilAberto(item) {
  const status = normalizar(item?.status)
  const texto = [
    item?.descricao,
    item?.observacao,
    item?.forma,
    item?.formaPagamento,
    item?.planoContaNome,
  ].map(normalizar).join(" ")

  if (!/(pendente|em aberto|aguardando)/.test(status)) return false
  if (/(receita bruta mensal|pagamento confirmado)/.test(texto)) return false
  if (/(^|\s)(fiscal|servico|financeiro):\d+/.test(texto)) return false
  if (/(confirmado pelo cliente|gerado automaticamente|automatico -)/.test(texto)) return false
  return true
}

module.exports = {
  financeiroAbertoParaPrioridade,
  movimentoContabilAberto,
}

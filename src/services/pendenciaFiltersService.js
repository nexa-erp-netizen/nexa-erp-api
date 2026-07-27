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

function financeiroDoEscritorioParaPrioridade(item) {
  if (!financeiroAbertoParaPrioridade(item)) return false

  const texto = [
    item?.descricao,
    item?.origem,
    item?.referenciaOrigem,
    item?.centroCusto,
  ].map(normalizar).join(" ")

  // Obrigações fiscais já são carregadas pela fonte Fiscal. Mesmo que um
  // lançamento legado traga "serviço" na origem, ele não pode ser somado
  // novamente pelo Financeiro.
  if (/(^|\s)fiscal:\d+|obrigacao fiscal|guia fiscal/.test(texto)) return false
  if (/(^|\s)(das|darf|inss|fgts)(\s|$)/.test(normalizar(item?.descricao))) return false

  return /(servico|honorario)/.test(texto)
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

function servicoAbertoParaPrioridade(item) {
  const status = normalizar(item?.status)
  if (/(recebid|cancelad|excluid|arquivad)/.test(status)) return false

  // A tela Serviços e Cobranças considera o status atual como fonte da verdade.
  // Registros antigos podem manter dataRecebimento mesmo depois de voltarem para
  // Pendente; nesse caso a tela mostra Atrasado e a Nexa deve fazer o mesmo.
  // A baixa só ocorre quando o status atual é Recebido.
  return true
}

function solicitacaoAbertaParaPrioridade(item) {
  const status = normalizar(item?.status)
  if (/(concluid|finalizad|cancelad|arquivad|atendid|resolvid)/.test(status)) return false
  return /(pendente|em aberto|aguardando|recebid|nova|aberta)/.test(status)
}

function deduplicarFiscaisAbertos(itens) {
  const chaves = new Set()
  return itens.filter((item) => {
    const chave = [
      normalizar(item?.cliente),
      normalizar(item?.obrigacao),
      normalizar(item?.competencia),
      String(item?.vencimento || "").slice(0, 10),
    ].join("|")

    if (chaves.has(chave)) return false
    chaves.add(chave)
    return true
  })
}

module.exports = {
  financeiroAbertoParaPrioridade,
  financeiroDoEscritorioParaPrioridade,
  movimentoContabilAberto,
  servicoAbertoParaPrioridade,
  solicitacaoAbertaParaPrioridade,
  deduplicarFiscaisAbertos,
}

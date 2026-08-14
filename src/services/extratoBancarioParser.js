function textoArquivo(buffer) {
  const utf8 = buffer.toString("utf8")
  return utf8.includes("�") ? buffer.toString("latin1") : utf8
}

function parseData(valor) {
  const texto = String(valor || "").trim()
  let m = texto.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = texto.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

function parseNumero(valor) {
  let texto = String(valor ?? "").trim().replace(/R\$/gi, "").replace(/\s/g, "")
  if (!texto) return 0
  const negativoParenteses = /^\(.*\)$/.test(texto)
  texto = texto.replace(/[()]/g, "")
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".")
  const numero = Number(texto.replace(/[^0-9.-]/g, ""))
  return (negativoParenteses ? -1 : 1) * (Number.isFinite(numero) ? numero : 0)
}

function tag(bloco, nome) {
  const match = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]+)`, "i"))
  return match ? match[1].trim() : ""
}

function parseOfx(buffer) {
  const texto = textoArquivo(buffer)
  const blocos = texto.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>)/gi) || []
  const movimentos = blocos.map((bloco) => {
    const valorAssinado = parseNumero(tag(bloco, "TRNAMT"))
    const descricao = tag(bloco, "MEMO") || tag(bloco, "NAME") || "Movimento bancário"
    return {
      data: parseData(tag(bloco, "DTPOSTED")),
      descricao,
      documento: tag(bloco, "CHECKNUM") || tag(bloco, "REFNUM") || null,
      fitId: tag(bloco, "FITID") || null,
      tipoBanco: tag(bloco, "TRNTYPE") || null,
      valorAssinado,
    }
  }).filter(item => item.data && item.valorAssinado !== 0)

  const saldo = parseNumero(tag(texto.match(/<LEDGERBAL>[\s\S]*?(?:<\/LEDGERBAL>|$)/i)?.[0] || "", "BALAMT"))
  return { movimentos, saldoInformado: saldo || null }
}

function linhaCsv(linha, separador) {
  const colunas = []
  let atual = "", aspas = false
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i]
    if (c === '"' && linha[i + 1] === '"' && aspas) { atual += '"'; i += 1 }
    else if (c === '"') aspas = !aspas
    else if (c === separador && !aspas) { colunas.push(atual.trim()); atual = "" }
    else atual += c
  }
  colunas.push(atual.trim())
  return colunas
}

function chave(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function parseCsv(buffer) {
  const texto = textoArquivo(buffer).replace(/^\uFEFF/, "")
  const linhas = texto.split(/\r?\n/).filter(l => l.trim())
  if (linhas.length < 2) throw new Error("O CSV não possui movimentos para importar.")
  const separador = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ","
  const cabecalhos = linhaCsv(linhas[0], separador).map(chave)
  const indice = (...nomes) => cabecalhos.findIndex(c => nomes.some(n => c === n || c.includes(n)))
  const iData = indice("data", "date", "dtmovimento", "datamovimento")
  const iDesc = indice("descricao", "historico", "memo", "lancamento", "detalhe")
  const iValor = indice("valor", "amount", "valorlancamento")
  const iCredito = indice("credito", "credit", "entrada")
  const iDebito = indice("debito", "debit", "saida")
  const iTipo = indice("tipo", "natureza", "dc")
  const iDoc = indice("documento", "doc", "id", "fitid")
  if (iData < 0 || (iValor < 0 && iCredito < 0 && iDebito < 0)) {
    throw new Error("CSV não reconhecido. Use colunas Data, Descrição e Valor, ou Data, Crédito e Débito.")
  }

  const movimentos = linhas.slice(1).map(l => linhaCsv(l, separador)).map(col => {
    let valorAssinado = iValor >= 0 ? parseNumero(col[iValor]) : parseNumero(col[iCredito]) - Math.abs(parseNumero(col[iDebito]))
    const tipo = chave(col[iTipo])
    if (iValor >= 0 && valorAssinado > 0 && ["d", "debito", "saida"].includes(tipo)) valorAssinado *= -1
    return {
      data: parseData(col[iData]),
      descricao: String(col[iDesc] || col[iDoc] || "Movimento bancário").trim(),
      documento: iDoc >= 0 ? String(col[iDoc] || "").trim() || null : null,
      fitId: null,
      tipoBanco: iTipo >= 0 ? col[iTipo] || null : null,
      valorAssinado,
    }
  }).filter(item => item.data && item.valorAssinado !== 0)
  if (!movimentos.length) throw new Error("Nenhum movimento válido foi encontrado no CSV.")
  return { movimentos, saldoInformado: null }
}

function lerExtrato(buffer, formato) {
  if (formato === "OFX") return parseOfx(buffer)
  if (formato === "CSV") return parseCsv(buffer)
  throw new Error("Formato não suportado. Envie um arquivo OFX ou CSV.")
}

module.exports = { lerExtrato, parseOfx, parseCsv, parseData, parseNumero }

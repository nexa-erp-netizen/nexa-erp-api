const pdf = require("pdf-parse")

const MESES = {
  janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
  outubro: "10", novembro: "11", dezembro: "12",
}

function dataIso(valor) {
  const [, dia, mes, ano] = String(valor || "").match(/(\d{2})\/(\d{2})\/(\d{4})/) || []
  return ano ? `${ano}-${mes}-${dia}` : null
}

function moedaNumero(valor) {
  return Number(String(valor || "").replace(/\./g, "").replace(",", "."))
}

async function lerDasMei(buffer) {
  const { text = "" } = await pdf(buffer)
  const texto = text.replace(/\u00a0/g, " ")

  if (!/Documento de Arrecada[cç][aã]o do Simples Nacional/i.test(texto) || !/PGMEI/i.test(texto)) {
    throw new Error("O arquivo não foi reconhecido como DAS mensal do PGMEI.")
  }
  if (/Per[ií]odo de Apura[cç][aã]o[\s\S]{0,250}\bDiversos\b/i.test(texto)) {
    throw new Error("Guia consolidada bloqueada: importe somente um DAS por competência.")
  }

  const cnpj = (texto.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/) || [])[0]
  const competenciaMatch = texto.match(/\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/i)
  const vencimentoMatch = texto.match(/Pagar este documento at[eé][\s\S]{0,120}?(\d{2}\/\d{2}\/\d{4})/i)
    || texto.match(/Data de Vencimento[\s\S]{0,180}?(\d{2}\/\d{2}\/\d{4})/i)
  const numero = (texto.match(/\b\d{2}\.\d{2}\.\d{5}\.\d{7}-\d\b/) || [])[0]
  const valorMatch = texto.match(/Valor Total do Documento[\s\S]{0,100}?(\d{1,3}(?:\.\d{3})*,\d{2})/i)
  const razaoMatch = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*\n\s*([^\n]+)/i)

  if (!cnpj || !competenciaMatch || !vencimentoMatch || !valorMatch) {
    throw new Error("Não foi possível identificar CNPJ, competência, vencimento e valor no PDF.")
  }
  const mes = MESES[competenciaMatch[1].toLowerCase()]
  return {
    cnpj: cnpj.replace(/\D/g, ""),
    razaoSocial: razaoMatch?.[1]?.trim() || null,
    competencia: `${competenciaMatch[2]}-${mes}`,
    vencimento: dataIso(vencimentoMatch[1]),
    valor: moedaNumero(valorMatch[1]),
    numeroDocumento: numero || null,
  }
}

module.exports = { lerDasMei }

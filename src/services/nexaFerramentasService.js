const PDFDocument = require("pdfkit")
const pdfParse = require("pdf-parse")
const mammoth = require("mammoth")
const Cliente = require("../models/Cliente")
const Financeiro = require("../models/Financeiro")
const Fiscal = require("../models/Fiscal")
const ServicoAvulso = require("../models/ServicoAvulso")

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function tipoRelatorio(mensagem) {
  const texto = normalizar(mensagem)
  if (/servico|cobranca|honorario/.test(texto)) return "cobrancas"
  if (/fiscal|obrigacao|imposto|guia/.test(texto)) return "fiscal"
  if (/financeiro|receita|despesa|conta a pagar|conta a receber/.test(texto)) return "financeiro"
  if (/cliente|carteira|cadastro/.test(texto)) return "clientes"
  return null
}

function detectarPedidoRelatorio(mensagem) {
  const texto = normalizar(mensagem)
  if (/\b(relatorio|resumo|panorama)\b.{0,25}\b(hoje|do dia|para hoje)\b/.test(texto)) return null
  if (!/\b(relatorio|exporte|exportar|planilha|excel|pdf)\b/.test(texto)) return null
  const formato = /\b(excel|planilha|xls)\b/.test(texto) ? "xls" : (/\bpdf\b/.test(texto) ? "pdf" : null)
  return { tipo: tipoRelatorio(mensagem), formato }
}

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function dataBr(valor) {
  const [ano, mes, dia] = String(valor || "").slice(0, 10).split("-")
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(valor || "-")
}

async function dadosRelatorio({ tipo, clienteId = null }) {
  if (tipo === "clientes") {
    const itens = await Cliente.findAll({ order: [["nome", "ASC"]], limit: 5000 })
    return { titulo: "Relatório de clientes", colunas: ["Nome", "CPF", "CNPJ", "Telefone", "Regime", "Situação"], linhas: itens.map((i) => [i.nome, i.cpf, i.cnpj, i.telefone, i.regime, i.situacaoEmpresa || (i.ativo === false ? "Inativo" : "Ativo")]) }
  }
  if (tipo === "cobrancas") {
    const itens = await ServicoAvulso.findAll({ where: clienteId ? { clienteId } : {}, order: [["vencimento", "DESC"]], limit: 5000 })
    return { titulo: "Relatório de serviços e cobranças", colunas: ["Cliente", "Serviço", "Data", "Vencimento", "Status", "Valor"], linhas: itens.map((i) => [i.cliente, i.descricao, dataBr(i.data), dataBr(i.vencimento), i.status, moeda(i.valorTotal)]) }
  }
  if (tipo === "fiscal") {
    const cliente = clienteId ? await Cliente.findByPk(clienteId) : null
    const itens = await Fiscal.findAll({ where: cliente ? { cliente: cliente.nome } : {}, order: [["vencimento", "DESC"]], limit: 5000 })
    return { titulo: "Relatório fiscal", colunas: ["Cliente", "Obrigação", "Competência", "Vencimento", "Status", "Valor"], linhas: itens.map((i) => [i.cliente, i.obrigacao, i.competencia, dataBr(i.vencimento), i.status, moeda(i.valor)]) }
  }
  const cliente = clienteId ? await Cliente.findByPk(clienteId) : null
  const itens = await Financeiro.findAll({ where: cliente ? { cliente: cliente.nome } : {}, order: [["vencimento", "DESC"]], limit: 5000 })
  return { titulo: "Relatório financeiro", colunas: ["Cliente", "Descrição", "Tipo", "Vencimento", "Status", "Valor"], linhas: itens.map((i) => [i.cliente, i.descricao, i.tipo, dataBr(i.vencimento), i.status, moeda(i.valor)]) }
}

function pdfBuffer(relatorio) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true })
    const partes = []
    doc.on("data", (parte) => partes.push(parte))
    doc.on("end", () => resolve(Buffer.concat(partes)))
    doc.on("error", reject)
    doc.fontSize(18).fillColor("#0b356f").text(relatorio.titulo)
    doc.moveDown(0.3).fontSize(9).fillColor("#555").text(`Gerado pela Nexa em ${new Date().toLocaleString("pt-BR")}`)
    doc.moveDown()
    doc.fontSize(8).fillColor("#111")
    doc.text(relatorio.colunas.join("  |  "), { continued: false })
    doc.moveTo(36, doc.y + 3).lineTo(559, doc.y + 3).strokeColor("#47bfe8").stroke()
    doc.moveDown(0.6)
    relatorio.linhas.forEach((linha) => {
      if (doc.y > 760) doc.addPage()
      doc.text(linha.map((v) => String(v ?? "")).join("  |  "))
      doc.moveDown(0.25)
    })
    doc.end()
  })
}

function xml(valor) {
  return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function xlsBuffer(relatorio) {
  const linha = (valores, cabecalho = false) => `<Row>${valores.map((v) => `<Cell${cabecalho ? ' ss:StyleID="cabecalho"' : ""}><Data ss:Type="String">${xml(v)}</Data></Cell>`).join("")}</Row>`
  const conteudo = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="cabecalho"><Font ss:Bold="1"/><Interior ss:Color="#47BFE8" ss:Pattern="Solid"/></Style></Styles><Worksheet ss:Name="Relatorio"><Table>${linha(relatorio.colunas, true)}${relatorio.linhas.map((l) => linha(l)).join("")}</Table></Worksheet></Workbook>`
  return Buffer.from(conteudo, "utf8")
}

async function gerarArquivoRelatorio({ tipo, formato, clienteId }) {
  const relatorio = await dadosRelatorio({ tipo, clienteId })
  const buffer = formato === "xls" ? xlsBuffer(relatorio) : await pdfBuffer(relatorio)
  const base = normalizar(relatorio.titulo).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return { buffer, nome: `${base}-${new Date().toISOString().slice(0, 10)}.${formato}`, mime: formato === "xls" ? "application/vnd.ms-excel" : "application/pdf", total: relatorio.linhas.length }
}

async function extrairTextoDocumento(arquivo) {
  const nome = normalizar(arquivo.originalname)
  if (arquivo.mimetype === "application/pdf" || nome.endsWith(".pdf")) return (await pdfParse(arquivo.buffer)).text
  if (/\.docx?$/.test(nome) || /wordprocessingml/.test(arquivo.mimetype)) return (await mammoth.extractRawText({ buffer: arquivo.buffer })).value
  if (/\.(txt|csv|json|xml)$/.test(nome) || /^text\//.test(arquivo.mimetype)) return arquivo.buffer.toString("utf8")
  throw Object.assign(new Error("Formato não aceito. Envie PDF, DOCX, TXT, CSV, JSON ou XML."), { statusCode: 400 })
}

async function analisarDocumento({ arquivo, pergunta = "" }) {
  const texto = String(await extrairTextoDocumento(arquivo)).replace(/\u0000/g, "").trim().slice(0, 60000)
  if (!texto) throw Object.assign(new Error("Não encontrei texto legível no documento."), { statusCode: 400 })
  const chave = process.env.GROQ_API_KEY
  if (!chave) return { resposta: `Documento lido com sucesso. Ele contém aproximadamente ${texto.split(/\s+/).length} palavras. Configure a Groq para obter a análise inteligente.`, pontos: [], trecho: texto.slice(0, 1200) }
  const resposta = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.GROQ_MODEL || "openai/gpt-oss-120b", temperature: 0.2, messages: [{ role: "system", content: "Você é a Nexa. Analise documentos em português brasileiro. Responda com resumo, pontos importantes, riscos, datas, valores e próximos passos. Não invente dados." }, { role: "user", content: `${pergunta ? `Pedido: ${pergunta}\n\n` : ""}Documento ${arquivo.originalname}:\n${texto}` }] }) })
  if (!resposta.ok) throw Object.assign(new Error("A análise inteligente do documento ficou indisponível."), { statusCode: 502, providerFailure: true })
  const json = await resposta.json()
  return { resposta: String(json.choices?.[0]?.message?.content || "Documento analisado."), pontos: [], nomeArquivo: arquivo.originalname, caracteresLidos: texto.length }
}

module.exports = { detectarPedidoRelatorio, gerarArquivoRelatorio, analisarDocumento }

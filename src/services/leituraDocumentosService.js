const path = require("path")
const supabase = require("../config/supabase")
const DocumentoDigital = require("../models/DocumentoDigital")

const BUCKET = "nexa-anexos"
const LIMITE_ARQUIVO = 12 * 1024 * 1024
const LIMITE_TEXTO = 250000

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function parecePedidoDeLeitura(mensagem) {
  const texto = normalizar(mensagem)
  const mencionaDocumento = /(document|arquivo|anexo|contrato|declarac|recibo|comprovante|pdf)/.test(texto)
  const querConteudo = /(procure|pesquise|leia|encontre|extraia|consta|informado|qual|quanto|faturamento|receita|cpf|cnpj|valor|endereco)/.test(texto)
  return mencionaDocumento && querConteudo
}

function anexosDoDocumento(documento) {
  const dados = documento?.toJSON ? documento.toJSON() : documento
  const anexos = Array.isArray(dados?.anexos) ? dados.anexos : []
  if (dados?.caminho) anexos.push({ nome: dados.nome || dados.tipo, caminho: dados.caminho })
  return anexos
    .map((anexo) => ({
      nome: String(anexo?.nome || path.basename(String(anexo?.caminho || "")) || "Documento"),
      caminho: String(anexo?.caminho || ""),
    }))
    .filter((anexo) => anexo.caminho && !anexo.caminho.startsWith("http"))
}

async function baixarArquivo(caminho) {
  const { data, error } = await supabase.storage.from(BUCKET).download(caminho)
  if (error || !data) throw new Error(error?.message || "Não foi possível baixar o documento")
  if (Number(data.size || 0) > LIMITE_ARQUIVO) throw new Error("Arquivo acima do limite de leitura")
  return Buffer.from(await data.arrayBuffer())
}

async function extrairTexto(buffer, nome) {
  const extensao = path.extname(nome).toLowerCase()
  if ([".txt", ".csv", ".tsv", ".json", ".xml", ".html", ".htm"].includes(extensao)) {
    return buffer.toString("utf8").slice(0, LIMITE_TEXTO)
  }
  if (extensao === ".pdf") {
    const pdf = require("pdf-parse")
    const resultado = await pdf(buffer)
    return String(resultado?.text || "").slice(0, LIMITE_TEXTO)
  }
  if (extensao === ".docx") {
    const mammoth = require("mammoth")
    const resultado = await mammoth.extractRawText({ buffer })
    return String(resultado?.value || "").slice(0, LIMITE_TEXTO)
  }
  throw new Error("Formato ainda não compatível com leitura")
}

function tipoDadoSolicitado(texto) {
  if (/\bcpf\b/.test(texto)) return "CPF"
  if (/\bcnpj\b/.test(texto)) return "CNPJ"
  if (/(faturamento|receita bruta|valor faturado)/.test(texto)) return "faturamento"
  if (/(enderec|domicilio)/.test(texto)) return "endereço"
  return null
}

function localizarDado(textoOriginal, mensagem) {
  const texto = String(textoOriginal || "").replace(/\s+/g, " ")
  const tipo = tipoDadoSolicitado(normalizar(mensagem))
  if (tipo === "CPF") {
    const achou = texto.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/)
    return achou ? { tipo, valor: achou[0].trim() } : null
  }
  if (tipo === "CNPJ") {
    const achou = texto.match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}\b/)
    return achou ? { tipo, valor: achou[0].trim() } : null
  }
  if (tipo === "faturamento") {
    const achou = texto.match(/(?:faturamento|receita bruta|valor faturado).{0,80}?(?:R\$\s*)?[\d.]+,\d{2}/i)
    if (achou) {
      const valor = achou[0].match(/(?:R\$\s*)?[\d.]+,\d{2}/)?.[0]
      return valor ? { tipo, valor } : null
    }
  }
  if (tipo === "endereço") {
    const achou = texto.match(/(?:endere[cç]o|domic[ií]lio)\s*[:\-]?\s*([^.;\n]{8,160})/i)
    return achou ? { tipo, valor: achou[1].trim() } : null
  }
  return null
}

function palavrasBusca(mensagem) {
  const ignorar = new Set(["qual", "quais", "quanto", "procure", "pesquise", "leia", "encontre", "documento", "documentos", "arquivo", "arquivos", "cliente", "dele", "dela", "nesse", "nessa", "neste", "nesta", "informado", "consta"])
  return normalizar(mensagem)
    .split(/[^a-z0-9]+/)
    .filter((palavra) => palavra.length >= 4 && !ignorar.has(palavra))
}

function trechoRelevante(texto, mensagem) {
  const limpo = String(texto || "").replace(/\s+/g, " ").trim()
  if (!limpo) return ""
  const palavras = palavrasBusca(mensagem)
  let indice = palavras.reduce((melhor, palavra) => {
    const atual = normalizar(limpo).indexOf(palavra)
    return atual >= 0 && (melhor < 0 || atual < melhor) ? atual : melhor
  }, -1)
  if (indice < 0) return ""
  const inicio = Math.max(0, indice - 100)
  return limpo.slice(inicio, inicio + 420).trim()
}

async function consultarDocumentos({ mensagem, cliente }) {
  if (!cliente || !parecePedidoDeLeitura(mensagem)) return null

  const nomeCliente = cliente.nome || cliente.razaoSocial || cliente.nomeFantasia
  const documentos = await DocumentoDigital.findAll({
    where: { cliente: nomeCliente },
    order: [["createdAt", "DESC"]],
    limit: 80,
  })
  const palavras = palavrasBusca(mensagem)
  const candidatos = documentos
    .flatMap((documento) => anexosDoDocumento(documento).map((anexo) => ({ documento, anexo })))
    .sort((a, b) => {
      const textoA = normalizar(`${a.documento.tipo} ${a.anexo.nome}`)
      const textoB = normalizar(`${b.documento.tipo} ${b.anexo.nome}`)
      const pontos = (texto) => palavras.reduce((total, palavra) => total + (texto.includes(palavra) ? 1 : 0), 0)
      return pontos(textoB) - pontos(textoA)
    })
    .slice(0, 12)

  const formatosIgnorados = []
  for (const candidato of candidatos) {
    try {
      const buffer = await baixarArquivo(candidato.anexo.caminho)
      const texto = await extrairTexto(buffer, candidato.anexo.nome)
      const dado = localizarDado(texto, mensagem)
      const trecho = trechoRelevante(texto, mensagem)
      if (!dado && !trecho) continue

      const fonte = candidato.anexo.nome
      const resposta = dado
        ? `Encontrei o ${dado.tipo} no documento “${fonte}”: ${dado.valor}.`
        : `Encontrei esta informação no documento “${fonte}”: ${trecho}`
      return {
        resposta,
        fala: dado ? `Encontrei no documento ${fonte}. O ${dado.tipo} é ${dado.valor}.` : `Encontrei a informação no documento ${fonte}.`,
        pontos: [{ titulo: "Fonte", detalhe: fonte, status: candidato.documento.tipo || "Documento" }],
        recomendacao: "",
        fundamentos: [`Conteúdo extraído do documento “${fonte}” vinculado a ${nomeCliente}.`],
        modo: "leitura-documentos",
        provedor: "sistema",
        modelo: "Nexa Documentos 1.0",
        clienteIdConfirmado: cliente.id,
        clienteNomeConfirmado: nomeCliente,
        consulta: {
          tipo: "conteudo-documento",
          titulo: "Leitura de documento",
          resumo: resposta,
          total: 1,
          itens: [{ id: candidato.documento.id, clienteId: cliente.id, cliente: nomeCliente, titulo: fonte, detalhe: trecho || dado?.valor }],
          fonte: { documentoId: candidato.documento.id, nome: fonte },
        },
        respondidoEm: new Date().toISOString(),
        aviso: "Consulta segura realizada. Nenhum dado foi alterado.",
      }
    } catch (error) {
      if (/Formato ainda não compatível/.test(error.message)) formatosIgnorados.push(candidato.anexo.nome)
      else console.warn("NEXA_LEITURA_DOCUMENTO:", candidato.anexo.nome, error.message)
    }
  }

  const complemento = formatosIgnorados.length
    ? " Alguns arquivos são imagens ou formatos que ainda precisam de OCR."
    : ""
  return {
    resposta: candidatos.length
      ? `Não encontrei essa informação no conteúdo legível dos documentos de ${nomeCliente}.${complemento}`
      : `Não encontrei documentos anexados para ${nomeCliente}.`,
    pontos: [],
    recomendacao: "",
    fundamentos: ["A Nexa pesquisou somente os documentos vinculados ao cliente selecionado."],
    modo: "leitura-documentos",
    provedor: "sistema",
    modelo: "Nexa Documentos 1.0",
    clienteIdConfirmado: cliente.id,
    clienteNomeConfirmado: nomeCliente,
    consulta: { tipo: "conteudo-documento", titulo: "Leitura de documento", resumo: "Informação não encontrada.", total: 0, itens: [] },
    respondidoEm: new Date().toISOString(),
    aviso: "Consulta segura realizada. Nenhum dado foi alterado.",
  }
}

module.exports = {
  parecePedidoDeLeitura,
  consultarDocumentos,
  extrairTexto,
  localizarDado,
}

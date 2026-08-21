const { gerarArquivoRelatorio, analisarDocumento } = require("../services/nexaFerramentasService")
const ConversaNexa = require("../models/ConversaNexa")
const MensagemNexa = require("../models/MensagemNexa")
const DocumentoAnaliseNexa = require("../models/DocumentoAnaliseNexa")
const Cliente = require("../models/Cliente")
const { obterConversaAtiva, ativarConversa } = require("../services/conversaAtivaService")

async function gerarRelatorio(req, res) {
  try {
    const tipo = ["clientes", "cobrancas", "fiscal", "financeiro", "documento"].includes(req.body?.tipo) ? req.body.tipo : "financeiro"
    const formato = req.body?.formato === "xls" ? "xls" : "pdf"
    const arquivo = await gerarArquivoRelatorio({ tipo, formato, clienteId: req.body?.clienteId || null, conversaId: Number(req.body?.conversaId || 0) || null, usuarioId: req.usuario.id })
    res.setHeader("Content-Type", arquivo.mime)
    res.setHeader("Content-Disposition", `attachment; filename="${arquivo.nome}"`)
    res.setHeader("X-Nexa-Total", String(arquivo.total))
    return res.send(arquivo.buffer)
  } catch (error) {
    console.error("ERRO AO GERAR RELATÓRIO DA NEXA:", error)
    return res.status(error.statusCode || 500).json({ message: error.message || "Não consegui gerar o relatório." })
  }
}

async function analisarDocumentoEnviado(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: "Selecione um documento." })
    let clienteId = Number(req.body?.clienteId || 0) || null
    if (req.usuario.perfil === "Cliente") {
      const clienteVinculado = await Cliente.findOne({ where: { nome: req.usuario.clienteVinculado || req.usuario.nome } })
      clienteId = clienteVinculado?.id || null
    } else if (clienteId && !(await Cliente.findByPk(clienteId))) {
      clienteId = null
    }

    let conversa = null
    const conversaIdInformada = Number(req.body?.conversaId || 0)
    if (conversaIdInformada) conversa = await ConversaNexa.findOne({ where: { id: conversaIdInformada, usuarioId: req.usuario.id } })
    if (!conversa) conversa = await obterConversaAtiva(req.usuario.id)
    if (!conversa) {
      conversa = await ConversaNexa.create({
        usuarioId: req.usuario.id,
        titulo: `Documento - ${String(req.file.originalname || "análise").slice(0, 80)}`,
        tipoContexto: clienteId ? "cliente" : "geral",
        clienteId,
        ativa: true,
        ultimaMensagemEm: new Date(),
      })
    }
    await ativarConversa(req.usuario.id, conversa)

    const resultado = await analisarDocumento({ arquivo: req.file, pergunta: req.body?.pergunta || "", clienteId })
    let analise = await DocumentoAnaliseNexa.findOne({ where: { conversaId: conversa.id, usuarioId: req.usuario.id, hashSha256: resultado.hashSha256 } })
    const dadosAnalise = {
      usuarioId: req.usuario.id,
      conversaId: conversa.id,
      clienteId,
      nomeArquivo: resultado.nomeArquivo,
      mimeType: resultado.mimeType,
      hashSha256: resultado.hashSha256,
      textoCriptografado: resultado.textoCriptografado,
      resumo: resultado.resposta,
      metadados: { caracteresLidos: resultado.caracteresLidos, contextoErpUtilizado: resultado.contextoErpUtilizado, clienteNome: resultado.clienteNome },
    }
    if (analise) await analise.update(dadosAnalise)
    else analise = await DocumentoAnaliseNexa.create(dadosAnalise)

    const metadadosPublicos = {
      pontos: resultado.pontos,
      nomeArquivo: resultado.nomeArquivo,
      caracteresLidos: resultado.caracteresLidos,
      contextoErpUtilizado: resultado.contextoErpUtilizado,
      clienteNome: resultado.clienteNome,
      documentoAnaliseId: analise.id,
      atividade: "analise-documental",
      provedor: process.env.GROQ_API_KEY ? "groq" : "sistema",
      modelo: "Nexa Documentos 2.0",
    }
    await MensagemNexa.create({ conversaId: conversa.id, usuarioId: req.usuario.id, autor: "usuario", texto: `Analisar documento: ${req.file.originalname}`, dados: { origem: "documento", nomeArquivo: req.file.originalname } })
    await MensagemNexa.create({ conversaId: conversa.id, usuarioId: req.usuario.id, autor: "nexa", texto: resultado.resposta, dados: metadadosPublicos })
    await conversa.update({ ultimaMensagemEm: new Date(), clienteId: clienteId || conversa.clienteId, tipoContexto: clienteId ? "cliente" : conversa.tipoContexto })

    return res.json({ resposta: resultado.resposta, ...metadadosPublicos, conversaId: conversa.id, historicoSalvo: true })
  } catch (error) {
    console.error("ERRO AO ANALISAR DOCUMENTO NA NEXA:", error)
    return res.status(error.statusCode || 500).json({ message: error.message || "Não consegui analisar o documento.", providerFailure: Boolean(error.providerFailure) })
  }
}

module.exports = { gerarRelatorio, analisarDocumentoEnviado }

const { gerarArquivoRelatorio, analisarDocumento } = require("../services/nexaFerramentasService")
const ConversaNexa = require("../models/ConversaNexa")
const MensagemNexa = require("../models/MensagemNexa")

async function gerarRelatorio(req, res) {
  try {
    const tipo = ["clientes", "cobrancas", "fiscal", "financeiro"].includes(req.body?.tipo) ? req.body.tipo : "financeiro"
    const formato = req.body?.formato === "xls" ? "xls" : "pdf"
    const arquivo = await gerarArquivoRelatorio({ tipo, formato, clienteId: req.body?.clienteId || null })
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
    const resultado = await analisarDocumento({ arquivo: req.file, pergunta: req.body?.pergunta || "" })
    const conversaId = Number(req.body?.conversaId || 0)
    if (conversaId) {
      const conversa = await ConversaNexa.findOne({ where: { id: conversaId, usuarioId: req.usuario.id } })
      if (conversa) {
        await MensagemNexa.create({ conversaId: conversa.id, usuarioId: req.usuario.id, autor: "usuario", texto: `Analisar documento: ${req.file.originalname}`, dados: { origem: "documento", nomeArquivo: req.file.originalname } })
        await MensagemNexa.create({ conversaId: conversa.id, usuarioId: req.usuario.id, autor: "nexa", texto: resultado.resposta, dados: { ...resultado, atividade: "analise-documental", provedor: "groq", modelo: "Nexa Documentos 1.0" } })
        await conversa.update({ ultimaMensagemEm: new Date() })
      }
    }
    return res.json(resultado)
  } catch (error) {
    console.error("ERRO AO ANALISAR DOCUMENTO NA NEXA:", error)
    return res.status(error.statusCode || 500).json({ message: error.message || "Não consegui analisar o documento.", providerFailure: Boolean(error.providerFailure) })
  }
}

module.exports = { gerarRelatorio, analisarDocumentoEnviado }

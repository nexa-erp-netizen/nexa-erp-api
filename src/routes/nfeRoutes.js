const express = require("express")
const Cliente = require("../models/Cliente")
const CredencialAcessoFiscal = require("../models/CredencialAcessoFiscal")
const NFeConfiguracao = require("../models/NFeConfiguracao")
const ProdutoNFe = require("../models/ProdutoNFe")
const NFe = require("../models/NFe")
const sequelize = require("../config/database")
const { autenticar } = require("../middlewares/authMiddleware")
const { consultarStatusServicoPR, autorizarNFePR, gerarDanfePdf, ENDPOINT_HOMOLOGACAO_PR } = require("../services/nfeSefazService")

const router = express.Router()
router.use(autenticar)
router.use((req, res, next) => ["Administrador", "Funcionário"].includes(req.usuario.perfil) ? next() : res.status(403).json({ message: "Acesso negado" }))

const texto = (valor) => String(valor || "").trim()
const numero = (valor) => Number(valor || 0)

function dadosProduto(body) {
  return {
    clienteId: Number(body.clienteId), codigo: texto(body.codigo), descricao: texto(body.descricao),
    ncm: texto(body.ncm).replace(/\D/g, ""), cest: texto(body.cest).replace(/\D/g, "") || null,
    cfop: texto(body.cfop).replace(/\D/g, ""), unidade: texto(body.unidade).toUpperCase() || "UN",
    valorUnitario: numero(body.valorUnitario), origem: texto(body.origem) || "0", csosn: texto(body.csosn) || null,
    cstIcms: texto(body.cstIcms) || null, cstPis: texto(body.cstPis) || null,
    cstCofins: texto(body.cstCofins) || null, ativo: body.ativo !== false,
  }
}

function validarProduto(dados) {
  const erros = []
  if (!dados.clienteId) erros.push("Selecione o emitente.")
  if (!dados.codigo) erros.push("Informe o código do produto.")
  if (!dados.descricao) erros.push("Informe a descrição do produto.")
  if (dados.ncm.length !== 8) erros.push("O NCM deve ter 8 dígitos.")
  if (dados.cfop.length !== 4) erros.push("O CFOP deve ter 4 dígitos.")
  if (dados.valorUnitario < 0) erros.push("O valor unitário não pode ser negativo.")
  return erros
}

function prepararNota(body) {
  const itens = Array.isArray(body.itens) ? body.itens.map((item) => ({
    produtoId: item.produtoId ? Number(item.produtoId) : null,
    codigo: texto(item.codigo), descricao: texto(item.descricao), ncm: texto(item.ncm), cfop: texto(item.cfop),
    unidade: texto(item.unidade) || "UN", quantidade: numero(item.quantidade), valorUnitario: numero(item.valorUnitario),
    valorTotal: Number((numero(item.quantidade) * numero(item.valorUnitario)).toFixed(2)),
    origem: texto(item.origem) || "0", csosn: texto(item.csosn) || null,
  })) : []
  const valorProdutos = itens.reduce((total, item) => total + item.valorTotal, 0)
  const valorFrete = numero(body.valorFrete)
  const valorDesconto = numero(body.valorDesconto)
  return {
    clienteId: Number(body.clienteId), serie: Number(body.serie || 1), ambiente: "homologacao", status: "rascunho",
    naturezaOperacao: texto(body.naturezaOperacao) || "Venda de mercadoria", destinatario: body.destinatario || {}, itens,
    valorProdutos: valorProdutos.toFixed(2), valorFrete: valorFrete.toFixed(2), valorDesconto: valorDesconto.toFixed(2),
    valorTotal: Math.max(0, valorProdutos + valorFrete - valorDesconto).toFixed(2),
  }
}

router.get("/configuracoes/:clienteId", async (req, res) => {
  const clienteId = Number(req.params.clienteId)
  const [[configuracao], cliente] = await Promise.all([NFeConfiguracao.findOrCreate({ where: { clienteId }, defaults: { clienteId } }), Cliente.findByPk(clienteId)])
  if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })
  res.json({ ...configuracao.toJSON(), inscricaoEstadual: texto(cliente.inscricaoEstadual) })
})

router.put("/configuracoes/:clienteId", async (req, res) => {
  const clienteId = Number(req.params.clienteId)
  const inscricaoEstadual = texto(req.body.inscricaoEstadual).replace(/\D/g, "")
  if (!inscricaoEstadual) return res.status(400).json({ message: "Informe a Inscrição Estadual do emitente." })
  const [configuracao] = await NFeConfiguracao.findOrCreate({ where: { clienteId }, defaults: { clienteId } })
  const cliente = await Cliente.findByPk(clienteId)
  if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })
  await cliente.update({ inscricaoEstadual })
  await configuracao.update({
    ambiente: "homologacao", serie: Math.max(1, Number(req.body.serie || 1)), proximoNumero: Math.max(1, Number(req.body.proximoNumero || 1)),
    crt: texto(req.body.crt) || null, naturezaOperacao: texto(req.body.naturezaOperacao) || "Venda de mercadoria",
    codigoMunicipio: texto(req.body.codigoMunicipio).replace(/\D/g, "") || null,
    certificadoDigitalId: null,
    provedor: null, ativo: false,
  })
  res.json({ ...configuracao.toJSON(), inscricaoEstadual })
})

router.get("/diagnostico/:clienteId", async (req, res) => {
  const clienteId = Number(req.params.clienteId)
  const [cliente, configuracao, produtos, certificado] = await Promise.all([
    Cliente.findByPk(clienteId), NFeConfiguracao.findOne({ where: { clienteId } }), ProdutoNFe.count({ where: { clienteId, ativo: true } }),
    CredencialAcessoFiscal.findOne({ where: { clienteId, metodo: "A1", ativo: true }, order: [["updatedAt", "DESC"]] }),
  ])
  if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })
  const pendencias = []
  if (!cliente.cnpj) pendencias.push("Informe o CNPJ do emitente.")
  if (!cliente.inscricaoEstadual) pendencias.push("Informe a inscrição estadual do emitente.")
  if (!cliente.cep || !cliente.endereco || !cliente.numero || !cliente.cidade || !cliente.estado) pendencias.push("Complete o endereço do emitente.")
  if (!configuracao?.crt) pendencias.push("Configure o CRT do emitente.")
  if (!configuracao?.codigoMunicipio || configuracao.codigoMunicipio.length !== 7) pendencias.push("Informe o código IBGE do município do emitente.")
  if (!certificado?.arquivoCriptografado || !certificado?.segredoCriptografado) pendencias.push("Envie o certificado A1 e a senha no Cofre de acessos fiscais.")
  if (!produtos) pendencias.push("Cadastre ao menos um produto fiscal.")
  res.json({ prontoParaRascunho: pendencias.length === 0, prontoParaEmitir: pendencias.length === 0, ambiente: "homologacao", uf: "PR", endpointStatus: ENDPOINT_HOMOLOGACAO_PR, certificadoA1: certificado ? { id: certificado.id, nomeArquivo: certificado.nomeArquivo, configurado: Boolean(certificado.arquivoCriptografado && certificado.segredoCriptografado) } : null, pendencias })
})

router.post("/diagnostico/:clienteId/status-sefaz", async (req, res) => {
  const clienteId = Number(req.params.clienteId); const cliente = await Cliente.findByPk(clienteId)
  if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })
  if (texto(cliente.estado).toUpperCase() !== "PR") return res.status(400).json({ message: "Esta etapa consulta somente a SEFA/PR." })
  const certificado = await CredencialAcessoFiscal.findOne({ where: { clienteId, metodo: "A1", ativo: true }, order: [["updatedAt", "DESC"]] })
  if (!certificado) return res.status(400).json({ message: "Cadastre o certificado A1 no Cofre de acessos fiscais." })
  try { res.json(await consultarStatusServicoPR(certificado)) }
  catch (error) { console.error("ERRO STATUS SEFA/PR:", error); res.status(502).json({ message: error.message || "Não foi possível consultar a SEFA/PR." }) }
})

router.get("/produtos", async (req, res) => {
  const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}
  res.json(await ProdutoNFe.findAll({ where, order: [["descricao", "ASC"]] }))
})
router.post("/produtos", async (req, res) => {
  const dados = dadosProduto(req.body); const erros = validarProduto(dados)
  if (erros.length) return res.status(400).json({ message: erros.join(" ") })
  try { res.status(201).json(await ProdutoNFe.create(dados)) } catch (error) { res.status(400).json({ message: error.name === "SequelizeUniqueConstraintError" ? "Já existe um produto com esse código para o emitente." : "Erro ao cadastrar produto." }) }
})
router.put("/produtos/:id", async (req, res) => {
  const produto = await ProdutoNFe.findByPk(req.params.id); if (!produto) return res.status(404).json({ message: "Produto não encontrado" })
  const dados = dadosProduto(req.body); const erros = validarProduto(dados); if (erros.length) return res.status(400).json({ message: erros.join(" ") })
  await produto.update(dados); res.json(produto)
})

router.get("/notas", async (req, res) => {
  const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}
  res.json(await NFe.findAll({ where, attributes: { exclude: ["xmlEnvio", "xmlAutorizado", "danfePdf"] }, order: [["createdAt", "DESC"]] }))
})
router.post("/notas", async (req, res) => {
  const dados = prepararNota(req.body)
  if (!dados.clienteId || !texto(dados.destinatario?.nome) || !texto(dados.destinatario?.cpfCnpj) || !dados.itens.length) return res.status(400).json({ message: "Emitente, destinatário, CPF/CNPJ e ao menos um item são obrigatórios." })
  if (dados.itens.some((item) => item.quantidade <= 0 || item.valorUnitario < 0)) return res.status(400).json({ message: "Revise quantidade e valor dos itens." })
  res.status(201).json(await NFe.create(dados))
})
router.put("/notas/:id", async (req, res) => {
  const nota = await NFe.findByPk(req.params.id); if (!nota) return res.status(404).json({ message: "NF-e não encontrada" })
  if (!["rascunho", "rejeitada"].includes(nota.status)) return res.status(409).json({ message: "Somente rascunhos ou notas rejeitadas podem ser alterados." })
  await nota.update(prepararNota(req.body)); res.json(nota)
})
router.post("/notas/:id/transmitir", async (req, res) => {
  const nota = await NFe.findByPk(req.params.id)
  if (!nota) return res.status(404).json({ message: "NF-e não encontrada" })
  if (!["rascunho", "rejeitada", "erro"].includes(nota.status)) return res.status(409).json({ message: "Esta NF-e não pode ser transmitida novamente." })
  const [emitente, configuracao, certificado] = await Promise.all([
    Cliente.findByPk(nota.clienteId), NFeConfiguracao.findOne({ where: { clienteId: nota.clienteId } }),
    CredencialAcessoFiscal.findOne({ where: { clienteId: nota.clienteId, metodo: "A1", ativo: true }, order: [["updatedAt", "DESC"]] }),
  ])
  const erros = []
  if (!emitente?.cnpj || !emitente?.inscricaoEstadual || !emitente?.endereco || !emitente?.numero || !emitente?.bairro || !emitente?.cep) erros.push("Complete CNPJ, IE e endereço do emitente.")
  if (!configuracao?.crt || !/^\d{7}$/.test(texto(configuracao.codigoMunicipio))) erros.push("Complete CRT e código IBGE do emitente.")
  if (!certificado) erros.push("Cadastre o certificado A1 no cofre.")
  const dest = nota.destinatario || {}
  if (!dest.cpfCnpj || !dest.cep || !dest.endereco || !dest.numero || !dest.bairro || !dest.cidade || !dest.estado) erros.push("Complete o documento e o endereço do destinatário.")
  if (!/^\d{7}$/.test(texto(dest.codigoMunicipio || configuracao?.codigoMunicipio))) erros.push("Informe o código IBGE do município do destinatário.")
  if (erros.length) return res.status(400).json({ message: erros.join(" ") })
  try {
    if (!nota.numero) {
      await sequelize.transaction(async (transaction) => {
        const cfg = await NFeConfiguracao.findOne({ where: { clienteId: nota.clienteId }, transaction, lock: transaction.LOCK.UPDATE })
        const numero = Number(cfg.proximoNumero || 1)
        await nota.update({ numero, serie: cfg.serie, status: "processando", erroEmissao: null }, { transaction })
        await cfg.update({ proximoNumero: numero + 1 }, { transaction })
      })
    } else await nota.update({ status: "processando", erroEmissao: null })
    const atualizada = await NFe.findByPk(nota.id)
    const retorno = await autorizarNFePR({ credencial: certificado, nota: atualizada, emitente, configuracao })
    if (!retorno.autorizado) {
      await atualizada.update({ status: "rejeitada", chaveAcesso: retorno.chave, xmlEnvio: retorno.xmlEnvio, codigoStatus: retorno.cStat, motivoStatus: retorno.xMotivo, erroEmissao: `${retorno.cStat || ""} — ${retorno.xMotivo}` })
      return res.status(422).json({ message: `NF-e rejeitada: ${retorno.cStat || ""} — ${retorno.xMotivo}`, nota: { id: atualizada.id, numero: atualizada.numero, status: "rejeitada", codigoStatus: retorno.cStat, motivoStatus: retorno.xMotivo } })
    }
    await atualizada.update({ status: "autorizada", chaveAcesso: retorno.chave, protocolo: retorno.protocolo, xmlEnvio: retorno.xmlEnvio, xmlAutorizado: retorno.xmlAutorizado, codigoStatus: retorno.cStat, motivoStatus: retorno.xMotivo, emitidaEm: new Date(), erroEmissao: null })
    const pdf = await gerarDanfePdf(atualizada)
    await atualizada.update({ danfePdf: pdf.toString("base64") })
    res.json({ message: "NF-e autorizada em homologação.", nota: { id: atualizada.id, numero: atualizada.numero, serie: atualizada.serie, status: atualizada.status, chaveAcesso: atualizada.chaveAcesso, protocolo: atualizada.protocolo } })
  } catch (error) {
    console.error("ERRO TRANSMISSÃO NF-E:", error)
    await nota.update({ status: "erro", erroEmissao: error.message }).catch(() => {})
    res.status(502).json({ message: error.message || "Falha ao transmitir a NF-e." })
  }
})

router.get("/notas/:id/xml", async (req, res) => {
  const nota = await NFe.findByPk(req.params.id)
  if (!nota?.xmlAutorizado) return res.status(404).json({ message: "XML autorizado não disponível." })
  res.set({ "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="NFe-${nota.chaveAcesso}.xml"` }).send(nota.xmlAutorizado)
})

router.get("/notas/:id/danfe", async (req, res) => {
  const nota = await NFe.findByPk(req.params.id)
  if (!nota?.danfePdf) return res.status(404).json({ message: "DANFE não disponível." })
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="DANFE-${nota.chaveAcesso}.pdf"` }).send(Buffer.from(nota.danfePdf, "base64"))
})

module.exports = router

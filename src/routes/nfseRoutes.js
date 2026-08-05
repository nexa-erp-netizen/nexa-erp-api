const express = require("express")
const Cliente = require("../models/Cliente")
const NFSeConfiguracao = require("../models/NFSeConfiguracao")
const ServicoNFSe = require("../models/ServicoNFSe")
const NFSe = require("../models/NFSe")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()
router.use(autenticar)
router.use((req, res, next) => ["Administrador", "Funcionário"].includes(req.usuario.perfil) ? next() : res.status(403).json({ message: "Acesso negado" }))

const texto = (v) => String(v || "").trim()
const numero = (v) => Number(v || 0)
const hoje = () => new Date().toISOString().slice(0, 10)

function dadosServico(body) {
  return { clienteId: Number(body.clienteId), codigo: texto(body.codigo), descricao: texto(body.descricao), codigoTributacaoNacional: texto(body.codigoTributacaoNacional) || null, codigoTributacaoMunicipal: texto(body.codigoTributacaoMunicipal) || null, itemListaServico: texto(body.itemListaServico) || null, cnae: texto(body.cnae).replace(/\D/g, "") || null, aliquotaIss: numero(body.aliquotaIss), valorUnitario: numero(body.valorUnitario), issRetido: body.issRetido === true, ativo: body.ativo !== false }
}

function validarServico(d) {
  const erros = []
  if (!d.clienteId) erros.push("Selecione o prestador.")
  if (!d.codigo) erros.push("Informe o código interno.")
  if (!d.descricao) erros.push("Informe a descrição do serviço.")
  if (!d.codigoTributacaoNacional && !d.codigoTributacaoMunicipal && !d.itemListaServico) erros.push("Informe ao menos um código de tributação do serviço.")
  if (d.aliquotaIss < 0 || d.aliquotaIss > 5) erros.push("A alíquota de ISS deve ficar entre 0% e 5%.")
  if (d.valorUnitario < 0) erros.push("O valor não pode ser negativo.")
  return erros
}

function prepararNota(body) {
  const servicos = Array.isArray(body.servicos) ? body.servicos.map((s) => {
    const quantidade = numero(s.quantidade); const valorUnitario = numero(s.valorUnitario); const valorTotal = Number((quantidade * valorUnitario).toFixed(2)); const aliquotaIss = numero(s.aliquotaIss)
    return { servicoId: s.servicoId ? Number(s.servicoId) : null, codigo: texto(s.codigo), descricao: texto(s.descricao), codigoTributacaoNacional: texto(s.codigoTributacaoNacional) || null, codigoTributacaoMunicipal: texto(s.codigoTributacaoMunicipal) || null, itemListaServico: texto(s.itemListaServico) || null, cnae: texto(s.cnae) || null, quantidade, valorUnitario, valorTotal, aliquotaIss, issRetido: s.issRetido === true }
  }) : []
  const valorServicos = servicos.reduce((t, s) => t + s.valorTotal, 0); const deducoes = Math.max(0, numero(body.valorDeducoes)); const base = Math.max(0, valorServicos - deducoes); const iss = servicos.reduce((t, s) => t + s.valorTotal * s.aliquotaIss / 100, 0); const retencoes = Math.max(0, numero(body.valorRetencoesFederais))
  return { clienteId: Number(body.clienteId), serie: texto(body.serie) || "1", ambiente: "homologacao", status: "rascunho", tomador: body.tomador || {}, servicos, competencia: texto(body.competencia) || hoje(), valorServicos: valorServicos.toFixed(2), valorDeducoes: deducoes.toFixed(2), baseCalculo: base.toFixed(2), valorIss: iss.toFixed(2), valorRetencoesFederais: retencoes.toFixed(2), valorLiquido: Math.max(0, valorServicos - retencoes).toFixed(2) }
}

router.get("/configuracoes/:clienteId", async (req, res) => { const clienteId = Number(req.params.clienteId); const [cfg] = await NFSeConfiguracao.findOrCreate({ where: { clienteId }, defaults: { clienteId } }); res.json(cfg) })
router.put("/configuracoes/:clienteId", async (req, res) => { const clienteId = Number(req.params.clienteId); const [cfg] = await NFSeConfiguracao.findOrCreate({ where: { clienteId }, defaults: { clienteId } }); await cfg.update({ ambiente: "homologacao", serie: texto(req.body.serie) || "1", proximoNumero: Math.max(1, Number(req.body.proximoNumero || 1)), regimeTributario: texto(req.body.regimeTributario) || null, inscricaoMunicipal: texto(req.body.inscricaoMunicipal) || null, municipioIbge: texto(req.body.municipioIbge).replace(/\D/g, "") || null, optanteSimples: req.body.optanteSimples !== false, incentivadorCultural: req.body.incentivadorCultural === true, certificadoDigitalId: req.body.certificadoDigitalId ? Number(req.body.certificadoDigitalId) : null, provedor: null, ativo: false }); res.json(cfg) })
router.get("/diagnostico/:clienteId", async (req, res) => { const clienteId = Number(req.params.clienteId); const [cliente, cfg, servicos] = await Promise.all([Cliente.findByPk(clienteId), NFSeConfiguracao.findOne({ where: { clienteId } }), ServicoNFSe.count({ where: { clienteId, ativo: true } })]); if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" }); const p = []; if (!cliente.cnpj) p.push("Informe o CNPJ do prestador."); if (!cfg?.inscricaoMunicipal && !cliente.inscricaoMunicipal) p.push("Informe a inscrição municipal do prestador, quando exigida pelo município."); if (!cfg?.municipioIbge) p.push("Informe o código IBGE do município do prestador."); if (!cfg?.regimeTributario) p.push("Selecione o regime tributário do prestador."); if (!servicos) p.push("Cadastre ao menos um serviço fiscal."); p.push("Configure o emissor nacional ou provedor homologado para liberar a transmissão."); res.json({ prontoParaRascunho: p.length === 1, prontoParaEmitir: false, ambiente: "homologacao", pendencias: p, aviso: "Inscrição estadual não é exigida neste módulo." }) })
router.get("/servicos", async (req, res) => { const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}; res.json(await ServicoNFSe.findAll({ where, order: [["descricao", "ASC"]] })) })
router.post("/servicos", async (req, res) => { const d = dadosServico(req.body); const e = validarServico(d); if (e.length) return res.status(400).json({ message: e.join(" ") }); try { res.status(201).json(await ServicoNFSe.create(d)) } catch (error) { res.status(400).json({ message: error.name === "SequelizeUniqueConstraintError" ? "Já existe um serviço com esse código para o prestador." : "Erro ao cadastrar serviço." }) } })
router.put("/servicos/:id", async (req, res) => { const item = await ServicoNFSe.findByPk(req.params.id); if (!item) return res.status(404).json({ message: "Serviço não encontrado" }); const d = dadosServico(req.body); const e = validarServico(d); if (e.length) return res.status(400).json({ message: e.join(" ") }); await item.update(d); res.json(item) })
router.get("/notas", async (req, res) => { const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}; res.json(await NFSe.findAll({ where, order: [["createdAt", "DESC"]] })) })
router.post("/notas", async (req, res) => { const d = prepararNota(req.body); if (!d.clienteId || !texto(d.tomador?.nome) || !texto(d.tomador?.cpfCnpj) || !d.servicos.length) return res.status(400).json({ message: "Prestador, tomador, CPF/CNPJ e ao menos um serviço são obrigatórios." }); if (d.servicos.some((s) => s.quantidade <= 0 || s.valorUnitario < 0)) return res.status(400).json({ message: "Revise quantidade e valor dos serviços." }); res.status(201).json(await NFSe.create(d)) })
router.post("/notas/:id/transmitir", async (_req, res) => res.status(409).json({ message: "Transmissão bloqueada nesta etapa. Configure primeiro o emissor nacional ou um provedor homologado." }))

module.exports = router

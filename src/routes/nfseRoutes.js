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
const digitos = (v) => texto(v).replace(/\D/g, "")

function documentoValido(valor) {
  const n = digitos(valor)
  if (![11, 14].includes(n.length) || /^(\d)\1+$/.test(n)) return false
  const cpf = (base) => { let soma = 0; for (let i = 0; i < base; i++) soma += Number(n[i]) * (base + 1 - i); const r = (soma * 10) % 11; return (r === 10 ? 0 : r) === Number(n[base]) }
  if (n.length === 11) return cpf(9) && cpf(10)
  const cnpj = (tamanho) => { const pesos = tamanho === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; const soma = pesos.reduce((t, p, i) => t + Number(n[i]) * p, 0); const r = soma % 11; return Number(n[tamanho]) === (r < 2 ? 0 : 11 - r) }
  return cnpj(12) && cnpj(13)
}
const emailValido = (v) => !texto(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(v))

function validarNota(d) {
  const erros = []
  if (!d.clienteId) erros.push("Selecione o prestador.")
  if (!texto(d.tomador?.nome)) erros.push("Informe o nome ou razão social do tomador.")
  if (!documentoValido(d.tomador?.cpfCnpj)) erros.push("Informe um CPF ou CNPJ válido.")
  if (!emailValido(d.tomador?.email)) erros.push("Informe um e-mail válido.")
  if (texto(d.tomador?.estado) && !/^[A-Z]{2}$/.test(texto(d.tomador.estado).toUpperCase())) erros.push("A UF deve conter duas letras, como PR.")
  if (!d.servicos.length) erros.push("Adicione ao menos um serviço.")
  if (d.servicos.some((s) => s.quantidade <= 0 || s.valorUnitario < 0)) erros.push("Revise quantidade e valor dos serviços.")
  return erros
}

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
  return { clienteId: Number(body.clienteId), numero: null, serieDps: texto(body.serieDps) || "70000", numeroDps: Math.max(1, Number(body.numeroDps || 1)), ambiente: "homologacao", status: "rascunho", tomador: body.tomador || {}, servicos, competencia: texto(body.competencia) || hoje(), valorServicos: valorServicos.toFixed(2), valorDeducoes: deducoes.toFixed(2), baseCalculo: base.toFixed(2), valorIss: iss.toFixed(2), valorRetencoesFederais: retencoes.toFixed(2), valorLiquido: Math.max(0, valorServicos - retencoes).toFixed(2) }
}

router.get("/configuracoes/:clienteId", async (req, res) => { const clienteId = Number(req.params.clienteId); const [cfg] = await NFSeConfiguracao.findOrCreate({ where: { clienteId }, defaults: { clienteId } }); res.json(cfg) })
router.put("/configuracoes/:clienteId", async (req, res) => { const clienteId = Number(req.params.clienteId); const [cfg] = await NFSeConfiguracao.findOrCreate({ where: { clienteId }, defaults: { clienteId } }); await cfg.update({ ambiente: "homologacao", serieDps: texto(req.body.serieDps) || "70000", proximoNumeroDps: Math.max(1, Number(req.body.proximoNumeroDps || 1)), regimeTributario: texto(req.body.regimeTributario) || null, inscricaoMunicipal: texto(req.body.inscricaoMunicipal) || null, municipioIbge: texto(req.body.municipioIbge).replace(/\D/g, "") || null, optanteSimples: req.body.optanteSimples !== false, incentivadorCultural: req.body.incentivadorCultural === true, certificadoDigitalId: req.body.certificadoDigitalId ? Number(req.body.certificadoDigitalId) : null, provedor: null, ativo: false }); res.json(cfg) })
router.get("/diagnostico/:clienteId", async (req, res) => { const clienteId = Number(req.params.clienteId); const [cliente, cfg, servicos] = await Promise.all([Cliente.findByPk(clienteId), NFSeConfiguracao.findOne({ where: { clienteId } }), ServicoNFSe.count({ where: { clienteId, ativo: true } })]); if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" }); const p = []; if (!cliente.cnpj) p.push("Informe o CNPJ do prestador."); if (!cfg?.inscricaoMunicipal && !cliente.inscricaoMunicipal) p.push("Informe a inscrição municipal do prestador, quando exigida pelo município."); if (!cfg?.municipioIbge) p.push("Informe o código IBGE do município do prestador."); if (!cfg?.regimeTributario) p.push("Selecione o regime tributário do prestador."); if (!servicos) p.push("Cadastre ao menos um serviço fiscal."); p.push("Configure o emissor nacional ou provedor homologado para liberar a transmissão."); res.json({ prontoParaRascunho: p.length === 1, prontoParaEmitir: false, ambiente: "homologacao", pendencias: p, aviso: "Inscrição estadual não é exigida neste módulo." }) })
router.get("/servicos", async (req, res) => { const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}; res.json(await ServicoNFSe.findAll({ where, order: [["descricao", "ASC"]] })) })
router.post("/servicos", async (req, res) => { const d = dadosServico(req.body); const e = validarServico(d); if (e.length) return res.status(400).json({ message: e.join(" ") }); try { res.status(201).json(await ServicoNFSe.create(d)) } catch (error) { res.status(400).json({ message: error.name === "SequelizeUniqueConstraintError" ? "Já existe um serviço com esse código para o prestador." : "Erro ao cadastrar serviço." }) } })
router.put("/servicos/:id", async (req, res) => { const item = await ServicoNFSe.findByPk(req.params.id); if (!item) return res.status(404).json({ message: "Serviço não encontrado" }); const d = dadosServico(req.body); const e = validarServico(d); if (e.length) return res.status(400).json({ message: e.join(" ") }); await item.update(d); res.json(item) })
router.get("/notas", async (req, res) => { const where = req.query.clienteId ? { clienteId: Number(req.query.clienteId) } : {}; res.json(await NFSe.findAll({ where, order: [["createdAt", "DESC"]] })) })
router.post("/notas", async (req, res) => { const d = prepararNota(req.body); const erros = validarNota(d); if (erros.length) return res.status(400).json({ message: erros.join(" ") }); const cfg = await NFSeConfiguracao.findOne({ where: { clienteId: d.clienteId } }); if (cfg) { d.serieDps = cfg.serieDps; d.numeroDps = cfg.proximoNumeroDps } const nota = await NFSe.create(d); if (cfg) await cfg.update({ proximoNumeroDps: Number(d.numeroDps) + 1 }); res.status(201).json(nota) })
router.put("/notas/:id", async (req, res) => { const nota = await NFSe.findByPk(req.params.id); if (!nota) return res.status(404).json({ message: "Rascunho não encontrado." }); if (nota.status !== "rascunho") return res.status(409).json({ message: "Somente rascunhos podem ser editados." }); const d = prepararNota(req.body); d.serieDps = nota.serieDps; d.numeroDps = nota.numeroDps; const erros = validarNota(d); if (erros.length) return res.status(400).json({ message: erros.join(" ") }); await nota.update(d); res.json(nota) })
router.delete("/notas/:id", async (req, res) => { const nota = await NFSe.findByPk(req.params.id); if (!nota) return res.status(404).json({ message: "Rascunho não encontrado." }); if (nota.status !== "rascunho") return res.status(409).json({ message: "Somente rascunhos podem ser excluídos." }); await nota.destroy(); res.status(204).end() })
router.get("/consultas/documento/:documento", async (req, res) => {
  const documento = digitos(req.params.documento)
  if (!documentoValido(documento)) return res.status(400).json({ message: "CPF ou CNPJ inválido." })
  const candidatos = await Cliente.findAll({ attributes: ["nome", "cpf", "cnpj", "email", "cep", "endereco", "numero", "bairro", "cidade", "estado"] })
  const interno = candidatos.find((c) => digitos(documento.length === 11 ? c.cpf : c.cnpj) === documento)
  if (interno) return res.json({ fonte: "Nexa", nome: interno.nome, email: interno.email, cep: interno.cep, endereco: interno.endereco, numero: interno.numero, bairro: interno.bairro, cidade: interno.cidade, estado: interno.estado })
  if (documento.length === 11) return res.status(404).json({ message: "CPF válido, mas não encontrado nos clientes da Nexa. Informe o nome manualmente." })
  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${documento}`, { signal: AbortSignal.timeout(8000) })
    if (!resposta.ok) throw new Error("consulta")
    const c = await resposta.json()
    res.json({ fonte: "Cadastro CNPJ", nome: c.razao_social || c.nome_fantasia, email: c.email, cep: c.cep, endereco: [c.descricao_tipo_de_logradouro, c.logradouro].filter(Boolean).join(" "), numero: c.numero, bairro: c.bairro, cidade: c.municipio, estado: c.uf })
  } catch { res.status(503).json({ message: "Não foi possível consultar o CNPJ agora. Você pode preencher os dados manualmente." }) }
})
router.get("/consultas/cep/:cep", async (req, res) => {
  const cep = digitos(req.params.cep)
  if (cep.length !== 8) return res.status(400).json({ message: "Informe um CEP com 8 números." })
  try { const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) }); const c = await resposta.json(); if (!resposta.ok || c.erro) return res.status(404).json({ message: "CEP não encontrado." }); res.json({ cep: c.cep, endereco: c.logradouro, bairro: c.bairro, cidade: c.localidade, estado: c.uf, municipioIbge: c.ibge }) } catch { res.status(503).json({ message: "Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente." }) }
})
router.post("/notas/:id/transmitir", async (_req, res) => res.status(409).json({ message: "Transmissão bloqueada nesta etapa. Configure primeiro o emissor nacional ou um provedor homologado." }))

module.exports = router

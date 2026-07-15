const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const CertificadoDigital = require("../models/CertificadoDigital")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")
const Usuario = require("../models/Usuario")

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function encerrado(status) {
  return ["pago", "recebido", "concluido", "entregue", "quitado", "conferido"].includes(normalizar(status))
}

function diasAte(data) {
  if (!data) return null
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const alvo = new Date(`${String(data).slice(0,10)}T00:00:00`)
  if (Number.isNaN(alvo.getTime())) return null
  return Math.ceil((alvo - hoje) / 86400000)
}

function nomeCliente(item) {
  return item?.nome || item?.razaoSocial || "Cliente"
}

async function contextoCliente(clienteId, usuario) {
  const cliente = await Cliente.findByPk(clienteId)
  if (!cliente) return null
  if (usuario?.perfil === "Cliente" && usuario?.clienteVinculado && cliente.nome !== usuario.clienteVinculado) return { proibido: true }

  const nome = nomeCliente(cliente)
  const [fiscais, financeiros, documentos, certificados, procuracoes] = await Promise.all([
    Fiscal.findAll({ where: { cliente: nome }, order: [["createdAt","DESC"]], limit: 100 }),
    Financeiro.findAll({ where: { cliente: nome }, order: [["createdAt","DESC"]], limit: 100 }),
    DocumentoDigital.findAll({ where: { cliente: nome }, order: [["createdAt","DESC"]], limit: 100 }),
    CertificadoDigital.findAll({ where: { clienteId }, order: [["dataValidade","DESC"]] }),
    ProcuracaoEcac.findAll({ where: { clienteId }, order: [["dataValidade","DESC"]] }),
  ])
  return { cliente, nome, fiscais, financeiros, documentos, certificados, procuracoes }
}

function respostaCliente(ctx, pergunta, nomeUsuario = "Administrador") {
  const pendFiscal = ctx.fiscais.filter((i) => !encerrado(i.status))
  const pendFin = ctx.financeiros.filter((i) => !encerrado(i.status))
  const pendDocs = ctx.documentos.filter((i) => !encerrado(i.status))
  const fiscaisVencidos = pendFiscal.filter((i) => (diasAte(i.vencimento) ?? 0) < 0)
  const certificado = ctx.certificados[0]
  const procuracao = ctx.procuracoes[0]
  const diasCert = diasAte(certificado?.dataValidade)
  const pontos = []
  const fundamentos = []

  pontos.push(`Regime: ${ctx.cliente.regime || "não informado"}.`)
  pontos.push(`${pendFiscal.length} pendência(s) fiscal(is), ${pendFin.length} financeira(s) e ${pendDocs.length} documental(is).`)
  pontos.push(certificado ? `Certificado com validade em ${certificado.dataValidade || "data não informada"}.` : "Certificado digital não cadastrado.")
  pontos.push(procuracao ? `Procuração e-CAC cadastrada até ${procuracao.dataValidade || "data não informada"}.` : "Procuração e-CAC não cadastrada.")

  if (fiscaisVencidos.length) fundamentos.push(`${fiscaisVencidos.length} obrigação(ões) fiscal(is) já ultrapassaram o vencimento.`)
  if (diasCert !== null && diasCert <= 30) fundamentos.push(diasCert < 0 ? `O certificado venceu há ${Math.abs(diasCert)} dia(s).` : `O certificado vence em ${diasCert} dia(s).`)
  if (!ctx.cliente.regime) fundamentos.push("O DNA tributário está incompleto, limitando análises mais precisas.")

  let recomendacao = "Manter o acompanhamento normal e concluir as ações abertas pela ordem de vencimento."
  if (fiscaisVencidos.length) recomendacao = "Eu priorizaria a regularização das obrigações fiscais vencidas antes das demais rotinas."
  else if (diasCert !== null && diasCert <= 30) recomendacao = "Eu iniciaria a renovação do certificado agora, sem deixar para a última semana."
  else if (pendFin.length) recomendacao = "Eu conferiria os valores pendentes e registraria o próximo contato ou decisão de cobrança."
  else if (pendDocs.length) recomendacao = "Eu resolveria os documentos pendentes para evitar bloqueios no próximo fechamento."

  const alvo = normalizar(pergunta)
  let resposta = `${nomeUsuario}, analisei ${ctx.nome}. Nos dados disponíveis, identifiquei ${pendFiscal.length + pendFin.length + pendDocs.length} item(ns) em aberto.`
  if (alvo.includes("certificado")) resposta = certificado ? `O certificado de ${ctx.nome} está cadastrado${diasCert === null ? "." : diasCert < 0 ? `, mas venceu há ${Math.abs(diasCert)} dia(s).` : ` e vence em ${diasCert} dia(s).`}` : `Ainda não encontrei certificado digital cadastrado para ${ctx.nome}.`
  else if (alvo.includes("procuracao") || alvo.includes("ecac")) resposta = procuracao ? `A procuração e-CAC de ${ctx.nome} está cadastrada até ${procuracao.dataValidade || "data não informada"}.` : `Não encontrei procuração e-CAC cadastrada para ${ctx.nome}.`
  else if (alvo.includes("tribut") || alvo.includes("anexo") || alvo.includes("regime")) resposta = `Minha leitura tributária inicial de ${ctx.nome} considera o regime ${ctx.cliente.regime || "ainda não informado"} e o ramo ${ctx.cliente.ramo || "ainda não informado"}. Para uma conclusão mais forte, a Nexa precisa dos dados completos de faturamento, folha e atividade.`

  return { resposta, pontos, recomendacao, fundamentos }
}

async function respostaEscritorio(pergunta, nomeUsuario = "Administrador") {
  const [clientes, fiscais, financeiros, certificados, procuracoes] = await Promise.all([
    Cliente.findAll(), Fiscal.findAll(), Financeiro.findAll(), CertificadoDigital.findAll(), ProcuracaoEcac.findAll(),
  ])
  const ativos = clientes.filter((c) => {
    const status = normalizar(c.statusOperacional || c.situacaoEmpresa || c.situacao)
    const regime = normalizar(c.regime)
    return !["avulso", "baixada", "inapta", "suspensa", "encerrada", "pausada"].includes(status) && regime !== "avulso"
  })
  const fiscaisPendentes = fiscais.filter((i) => !encerrado(i.status))
  const fiscaisVencidos = fiscaisPendentes.filter((i) => (diasAte(i.vencimento) ?? 0) < 0)
  const financeirosPendentes = financeiros.filter((i) => !encerrado(i.status))
  const certProximos = certificados.filter((i) => { const d = diasAte(i.dataValidade); return d !== null && d <= 30 })
  const procProximas = procuracoes.filter((i) => { const d = diasAte(i.dataValidade); return d !== null && d <= 30 })
  const pontos = [
    `${ativos.length} cliente(s) operacional(is) ativo(s).`,
    `${fiscaisPendentes.length} obrigação(ões) fiscal(is) em aberto, sendo ${fiscaisVencidos.length} vencida(s).`,
    `${financeirosPendentes.length} lançamento(s) financeiro(s) sem conclusão.`,
    `${certProximos.length} certificado(s) e ${procProximas.length} procuração(ões) vencidos ou próximos do vencimento.`,
  ]
  const fundamentos = []
  if (fiscaisVencidos.length) fundamentos.push("Existem obrigações fiscais vencidas, que representam o maior risco operacional imediato.")
  if (certProximos.length) fundamentos.push("Certificados vencidos ou próximos podem interromper acessos ao e-CAC.")
  if (financeirosPendentes.length) fundamentos.push("Lançamentos financeiros sem conclusão exigem conferência antes do fechamento.")
  let recomendacao = "Comece pelos itens vencidos e depois avance para os vencimentos mais próximos."
  if (fiscaisVencidos.length) recomendacao = "Eu começaria pelas obrigações fiscais vencidas e confirmaria a regularização antes das tarefas programadas."
  else if (certProximos.length) recomendacao = "Eu revisaria primeiro os certificados e procurações próximos do vencimento."

  const q = normalizar(pergunta)
  let resposta = `${nomeUsuario}, o escritório tem ${ativos.length} cliente(s) ativo(s) na rotina. Encontrei ${fiscaisVencidos.length} pendência(s) fiscal(is) vencida(s) e ${certProximos.length + procProximas.length} alerta(s) de identidade digital.`
  if (q.includes("certificado")) resposta = `Encontrei ${certProximos.length} certificado(s) vencido(s) ou com vencimento nos próximos 30 dias.`
  else if (q.includes("cliente") && (q.includes("atencao") || q.includes("prior"))) resposta = fiscaisVencidos.length ? `Os clientes ligados às ${fiscaisVencidos.length} obrigações fiscais vencidas devem aparecer primeiro na sua análise de hoje.` : "Não encontrei obrigações fiscais vencidas; priorize os vencimentos mais próximos e os alertas digitais."
  else if (q.includes("recomenda") || q.includes("agora")) resposta = `Minha recomendação para agora é: ${recomendacao}`

  return { resposta, pontos, recomendacao, fundamentos }
}

async function conversar(req, res) {
  try {
    const mensagem = String(req.body?.mensagem || "").trim()
    const clienteId = req.body?.clienteId ? Number(req.body.clienteId) : null
    if (!mensagem) return res.status(400).json({ message: "Escreva uma pergunta para a Nexa" })

    const usuarioBanco = await Usuario.findByPk(req.usuario.id)
    const nomeUsuario = usuarioBanco?.nome || "Administrador"

    let resultado
    if (clienteId) {
      const ctx = await contextoCliente(clienteId, req.usuario)
      if (!ctx) return res.status(404).json({ message: "Cliente não encontrado" })
      if (ctx.proibido) return res.status(403).json({ message: "Acesso não autorizado" })
      resultado = respostaCliente(ctx, mensagem, nomeUsuario)
    } else {
      resultado = await respostaEscritorio(mensagem, nomeUsuario)
    }

    return res.json({
      ...resultado,
      respondidoEm: new Date().toISOString(),
      aviso: "A resposta utiliza os dados disponíveis na Nexa e apoia, mas não substitui, a decisão profissional do contador.",
    })
  } catch (error) {
    console.error("ERRO NA CONVERSA DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao conversar com a Nexa" })
  }
}

module.exports = { conversar }

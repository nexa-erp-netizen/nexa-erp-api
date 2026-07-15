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
function finalizado(status) {
  return ["pago","recebido","concluido","entregue","quitado","conferido","cancelado"].includes(normalizar(status))
}
function diasAte(data) {
  if (!data) return null
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const alvo = new Date(`${String(data).slice(0,10)}T00:00:00`)
  if (Number.isNaN(alvo.getTime())) return null
  return Math.ceil((alvo-hoje)/86400000)
}
function nivel(pontos) {
  if (pontos >= 90) return "Crítico"
  if (pontos >= 70) return "Urgente"
  if (pontos >= 40) return "Atenção"
  return "Informativo"
}
function clienteAtivo(c) {
  const status = normalizar(c.statusOperacional || c.situacaoEmpresa || c.situacao)
  return !["avulso","baixada","inapta","suspensa","encerrada","pausada","em constituicao"].includes(status) && normalizar(c.regime) !== "avulso"
}

async function listarRadar(req, res) {
  try {
    const [clientes, fiscais, financeiros, documentos, certificados, procuracoes, usuario] = await Promise.all([
      Cliente.findAll(), Fiscal.findAll(), Financeiro.findAll(), DocumentoDigital.findAll(),
      CertificadoDigital.findAll(), ProcuracaoEcac.findAll(), Usuario.findByPk(req.usuario.id),
    ])
    const nomesAtivos = new Set(clientes.filter(clienteAtivo).map(c => c.nome))
    const itens = []

    fiscais.filter(i => nomesAtivos.has(i.cliente) && !finalizado(i.status)).forEach(i => {
      const dias = diasAte(i.vencimento)
      let pontos = dias === null ? 35 : dias < 0 ? 100 : dias === 0 ? 90 : dias <= 3 ? 80 : dias <= 7 ? 55 : 25
      itens.push({ tipo:"Fiscal", id:i.id, cliente:i.cliente, titulo:`${i.obrigacao || "Obrigação fiscal"}`, descricao: dias === null ? "Pendência fiscal sem vencimento válido." : dias < 0 ? `Vencida há ${Math.abs(dias)} dia(s).` : dias === 0 ? "Vence hoje." : `Vence em ${dias} dia(s).`, motivo:"Risco fiscal e prazo de vencimento.", pontos, nivel:nivel(pontos), destino:"Fiscal" })
    })

    financeiros.filter(i => nomesAtivos.has(i.cliente) && !finalizado(i.status)).forEach(i => {
      const dias = diasAte(i.vencimento)
      const atraso = dias !== null && dias < 0
      const pontos = atraso ? 85 : dias !== null && dias <= 3 ? 60 : 30
      itens.push({ tipo:"Financeiro", id:i.id, cliente:i.cliente, titulo:i.descricao || "Pendência financeira", descricao: atraso ? `Em atraso há ${Math.abs(dias)} dia(s).` : dias === null ? "Sem data de vencimento válida." : `Vence em ${dias} dia(s).`, motivo:"Pendência financeira sem conclusão.", pontos, nivel:nivel(pontos), destino:"Financeiro" })
    })

    documentos.filter(i => nomesAtivos.has(i.cliente) && !finalizado(i.status)).forEach(i => {
      const pontos = 42
      itens.push({ tipo:"Documento", id:i.id, cliente:i.cliente, titulo:i.tipo || "Documento pendente", descricao:`Status: ${i.status || "Pendente"}.`, motivo:"Documento ainda exige tratamento.", pontos, nivel:nivel(pontos), destino:"Documentos Digitais" })
    })

    certificados.filter(i => i.ativo !== false).forEach(i => {
      const dias = diasAte(i.dataValidade)
      if (dias === null || dias > 60) return
      const pontos = dias < 0 ? 100 : dias <= 7 ? 90 : dias <= 15 ? 75 : dias <= 30 ? 60 : 40
      itens.push({ tipo:"Certificado", id:i.id, cliente:i.cliente, titulo:"Certificado digital", descricao:dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s).` : `Vence em ${dias} dia(s).`, motivo:"O vencimento pode bloquear acessos e transmissões.", pontos, nivel:nivel(pontos), destino:"Certificados Digitais" })
    })

    procuracoes.filter(i => i.ativa !== false).forEach(i => {
      const dias = diasAte(i.dataValidade)
      if (dias === null || dias > 60) return
      const pontos = dias < 0 ? 95 : dias <= 7 ? 85 : dias <= 15 ? 70 : dias <= 30 ? 55 : 40
      itens.push({ tipo:"Procuração", id:i.id, cliente:i.cliente, titulo:"Procuração e-CAC", descricao:dias < 0 ? `Vencida há ${Math.abs(dias)} dia(s).` : `Vence em ${dias} dia(s).`, motivo:"A procuração pode impedir consultas e serviços no e-CAC.", pontos, nivel:nivel(pontos), destino:"Procurações e-CAC" })
    })

    itens.sort((a,b) => b.pontos-a.pontos)
    const resumo = { críticos: itens.filter(i=>i.nivel==="Crítico").length, urgentes: itens.filter(i=>i.nivel==="Urgente").length, atenção: itens.filter(i=>i.nivel==="Atenção").length, informativos: itens.filter(i=>i.nivel==="Informativo").length }
    const nome = usuario?.nome || "Administrador"
    res.json({ mensagem: itens.length ? `${nome}, encontrei ${itens.length} item(ns) no radar. Organizei primeiro os que exigem ação mais rápida.` : `${nome}, não encontrei riscos relevantes neste momento.`, resumo, itens: itens.slice(0,100), atualizadoEm:new Date().toISOString() })
  } catch (error) {
    console.error("ERRO NO RADAR NEXA:", error)
    res.status(500).json({ message:"Erro ao carregar Radar Inteligente" })
  }
}
module.exports = { listarRadar }

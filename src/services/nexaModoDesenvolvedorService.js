const crypto = require("crypto")
const { responderCodigoAutonomo } = require("./nexaCodigoAutonomoService")

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function pareceComandoDesenvolvedor(mensagem) {
  const texto = normalizar(mensagem)
  return /\b(modo desenvolvedor|modo developer|diagnostico tecnico|diagnostico do sistema|saude do sistema|saude da api|saude do banco|estado da api|estado do banco|plano de correcao|github|repositorio|publicar correcao|publique|status da correcao|status do plano)\b/.test(texto)
    || (/\b(diagnosti\w*|analis\w*|verifi\w*|prepar\w*)\b/.test(texto) && /\b(incidente|erro|falha)\s*#?\s*\d+\b/.test(texto))
}

function idIncidente(mensagem) {
  return Number(normalizar(mensagem).match(/\b(?:incidente|erro|falha)\s*#?\s*(\d+)\b/)?.[1]) || null
}

function fingerprintPlano(incidente) {
  return crypto.createHash("sha256").update(`incidente:${incidente.id}:${incidente.fingerprint}`).digest("hex")
}

function etapasDoPlano(incidente) {
  const categoria = normalizar(incidente.categoria)
  const etapas = [
    { ordem: 1, acao: "Preservar evidências e registrar o estado anterior", automatizavel: true },
    { ordem: 2, acao: "Reproduzir a falha com dados protegidos", automatizavel: false },
  ]
  if (categoria.includes("banco")) etapas.push({ ordem: 3, acao: "Comparar modelos, estrutura e registros relacionados sem modificar produção", automatizavel: true })
  else if (categoria.includes("interface")) etapas.push({ ordem: 3, acao: "Localizar o componente e validar o build da Web", automatizavel: true })
  else etapas.push({ ordem: 3, acao: "Localizar a primeira exceção e o componente de origem", automatizavel: true })
  etapas.push(
    { ordem: 4, acao: "Aplicar a correção em transação ou versão recuperável", automatizavel: false },
    { ordem: 5, acao: "Executar testes e conferir o resultado funcional", automatizavel: true },
    { ordem: 6, acao: "Registrar antes, depois e resultado da validação", automatizavel: true },
  )
  return etapas
}

function testesDoPlano(incidente) {
  const categoria = normalizar(incidente.categoria)
  const testes = ["Repetir a operação que originou o incidente", "Confirmar que não surgiu novo erro 5xx", "Conferir isolamento do escritório"]
  if (categoria.includes("banco")) testes.push("Validar integridade e quantidade de registros antes e depois")
  if (categoria.includes("interface")) testes.push("Executar build de produção da Web")
  return testes
}

async function diagnosticoSaude() {
  const { Op } = require("sequelize")
  const sequelize = require("../config/database")
  const IncidenteSistema = require("../models/IncidenteSistema")
  const inicio = Date.now()
  await sequelize.authenticate()
  await sequelize.query("SELECT 1")
  const latenciaBancoMs = Date.now() - inicio
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [abertos, criticos, ultimas24h, ultimo] = await Promise.all([
    IncidenteSistema.count({ where: { status: "Aberto" } }),
    IncidenteSistema.count({ where: { status: "Aberto", nivel: "Crítico" } }),
    IncidenteSistema.count({ where: { ultimaOcorrenciaEm: { [Op.gte]: desde } } }),
    IncidenteSistema.findOne({ order: [["ultimaOcorrenciaEm", "DESC"]], attributes: ["id", "titulo", "nivel", "ultimaOcorrenciaEm"] }),
  ])
  return {
    api: "online",
    banco: "conectado",
    latenciaBancoMs,
    incidentesAbertos: abertos,
    incidentesCriticos: criticos,
    ocorrenciasUltimas24h: ultimas24h,
    ultimoIncidente: ultimo ? { id: ultimo.id, titulo: ultimo.titulo, nivel: ultimo.nivel, ocorridoEm: ultimo.ultimaOcorrenciaEm } : null,
    verificadoEm: new Date().toISOString(),
  }
}

async function criarPlanoCorrecao({ incidente, usuario }) {
  const { Op } = require("sequelize")
  const PlanoCorrecaoNexa = require("../models/PlanoCorrecaoNexa")
  const fingerprint = fingerprintPlano(incidente)
  const existente = await PlanoCorrecaoNexa.findOne({ where: { fingerprint, status: { [Op.notIn]: ["Cancelado", "Concluído"] } }, order: [["createdAt", "DESC"]] })
  if (existente) return existente
  return PlanoCorrecaoNexa.create({
    incidenteId: incidente.id,
    fingerprint,
    titulo: `Correção do incidente #${incidente.id} — ${incidente.titulo}`,
    diagnostico: incidente.diagnostico || incidente.causaProvavel || "Diagnóstico pendente de reprodução controlada.",
    causaRaiz: incidente.causaProvavel,
    escopo: { origem: incidente.origem, componente: incidente.componente, rota: incidente.rota, categoria: incidente.categoria },
    etapas: etapasDoPlano(incidente),
    testesPrevistos: testesDoPlano(incidente),
    rollback: "Restaurar a versão anterior e reverter a transação ou migração aplicada.",
    risco: incidente.risco || "Médio",
    exigeConfirmacao: true,
    usuarioId: usuario?.id || null,
  })
}

async function responderModoDesenvolvedor({ mensagem, usuario }) {
  if (!pareceComandoDesenvolvedor(mensagem)) return null
  if (usuario?.perfil !== "Administrador") return { resposta: "O Modo Desenvolvedor é restrito ao administrador.", modo: "nexa-dev-bloqueado" }
  try {
    const codigo = await responderCodigoAutonomo({ mensagem, usuario })
    if (codigo) return codigo
  } catch (error) {
    console.error("NEXA DEVELOPER CODE:", error?.message || error)
    return { resposta: `Não consegui preparar essa correção com segurança: ${String(error?.message || "falha na integração").slice(0, 250)}. Nenhuma alteração foi publicada.`, modo: "nexa-dev-codigo", atividade: "correcao-codigo" }
  }
  const texto = normalizar(mensagem)
  const solicitado = idIncidente(mensagem)
  if (solicitado) {
    const IncidenteSistema = require("../models/IncidenteSistema")
    const incidente = await IncidenteSistema.findByPk(solicitado)
    if (!incidente) return { resposta: `Não encontrei o incidente #${solicitado}.`, modo: "nexa-dev" }
    const plano = await criarPlanoCorrecao({ incidente, usuario })
    await incidente.update({ status: incidente.status === "Aberto" ? "Em diagnóstico" : incidente.status })
    return {
      resposta: `Diagnostiquei o incidente #${incidente.id}: ${incidente.titulo}. Causa provável: ${incidente.causaProvavel || incidente.diagnostico || "a reprodução controlada ainda é necessária"}. Preparei o plano #${plano.id} com ${plano.etapas.length} etapas e ${plano.testesPrevistos.length} testes. Nenhuma alteração foi executada ainda.`,
      modo: "nexa-modo-desenvolvedor",
      atividade: "plano-correcao",
      provedor: "sistema",
      modelo: "Nexa Developer 1.0",
      incidenteId: incidente.id,
      planoCorrecao: plano,
    }
  }
  const saude = await diagnosticoSaude()
  const estado = saude.incidentesCriticos ? "instável" : "operacional"
  return {
    resposta: `Modo Desenvolvedor ativo. API online e banco conectado em ${saude.latenciaBancoMs} ms. O sistema está ${estado}: ${saude.incidentesAbertos} incidente(s) aberto(s), ${saude.incidentesCriticos} crítico(s) e ${saude.ocorrenciasUltimas24h} ocorrência(s) nas últimas 24 horas.${saude.ultimoIncidente ? ` Último: #${saude.ultimoIncidente.id} — ${saude.ultimoIncidente.titulo}.` : ""}`,
    modo: "nexa-modo-desenvolvedor",
    atividade: "saude-sistema",
    provedor: "sistema",
    modelo: "Nexa Developer 1.0",
    saude,
  }
}

module.exports = { responderModoDesenvolvedor, pareceComandoDesenvolvedor, diagnosticoSaude, criarPlanoCorrecao }

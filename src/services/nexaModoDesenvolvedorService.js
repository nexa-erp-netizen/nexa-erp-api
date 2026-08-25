const crypto = require("crypto")
const { responderCodigoAutonomo } = require("./nexaCodigoAutonomoService")
const { garantirMemoriaTecnica } = require("./nexaMemoriaTecnicaService")

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function pareceComandoDesenvolvedor(mensagem) {
  const texto = normalizar(mensagem)
  return /\b(modo desenvolvedor|modo developer|diagnostico tecnico|diagnostico do sistema|saude do sistema|saude da api|saude do banco|estado da api|estado do banco|plano de correcao|github|repositorio|arquivos? da api|arquivos? (?:da )?web|codigo da api|codigo (?:da )?web|analisar (?:o )?codigo|analisar (?:os )?arquivos|revisar (?:o )?codigo|auditar (?:o )?codigo|publicar correcao|valid\w* (?:a )?publicacao|valid\w* (?:a )?versao|valid\w* (?:o )?deploy|publique|status da correcao|status do plano)\b/.test(texto)
    || (/\b(diagnosti\w*|analis\w*|verifi\w*|prepar\w*)\b/.test(texto) && /\b(incidente|erro|falha)\s*#?\s*\d+\b/.test(texto))
    || (/\b(analis\w*|revis\w*|verifi\w*|investig\w*|audit\w*)\b/.test(texto) && /\b(api|web|codigo|arquivos?|repositorio|layout|interface|tela|modulo)\b/.test(texto))
    || (/\b(prepar\w*|corrij\w*|consert\w*|resolver)\b/.test(texto) && /\bplano\s*#?\s*\d+\b/.test(texto))
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

function avaliarNaturezaIncidente(incidente, saude, agora = new Date()) {
  const texto = normalizar(`${incidente.titulo} ${incidente.mensagem} ${incidente.categoria} ${incidente.causaProvavel} ${incidente.tipoFalha}`)
  const statusHttp = Number(incidente.statusHttp || 0)
  const ultima = incidente.ultimaOcorrenciaEm ? new Date(incidente.ultimaOcorrenciaEm) : null
  const minutosSemRepetir = ultima && !Number.isNaN(ultima.getTime())
    ? Math.max(0, Math.floor((agora.getTime() - ultima.getTime()) / 60000))
    : null
  const sinalTemporario = [502, 503, 504].includes(statusHttp)
    || /temporar|timeout|timed out|tempo de resposta|servico dependente|indisponivel|falha ao acessar|conexao/.test(texto)
  const sistemaSaudavel = saude?.api === "online" && saude?.banco === "conectado"
  const semRepeticaoRecente = minutosSemRepetir !== null && minutosSemRepetir >= 15
  if (sinalTemporario && sistemaSaudavel && semRepeticaoRecente) {
    return {
      tipo: "Falha temporária",
      conclusao: `Foi uma falha momentânea de comunicação. A API e o banco estão funcionando normalmente e o erro não voltou a ocorrer.`,
      precisaCorrecaoCodigo: false,
      recomendacao: "Não há correção de código para publicar. O incidente continuará registrado e será reaberto automaticamente se a falha voltar.",
      minutosSemRepetir,
    }
  }
  if (Number(incidente.ocorrencias || 0) > 1) {
    return {
      tipo: "Falha recorrente",
      conclusao: `A falha ocorreu ${incidente.ocorrencias} vezes e precisa ser relacionada ao log e ao arquivo responsável antes de qualquer alteração.`,
      precisaCorrecaoCodigo: true,
      recomendacao: "Posso preparar a correção em uma área separada quando a causa estiver comprovada, sem publicar sem autorização.",
      minutosSemRepetir,
    }
  }
  const possivelCodigo = /persistente|falha interna|banco de dados|interface web/.test(texto)
  return {
    tipo: possivelCodigo ? "Possível erro de código" : "Em investigação",
    conclusao: possivelCodigo
      ? "O registro indica uma falha interna, mas ainda não há evidência suficiente para apontar qual arquivo precisa ser alterado."
      : "Ainda não há evidência suficiente para afirmar se o problema está no código ou em um serviço externo.",
    precisaCorrecaoCodigo: null,
    recomendacao: "Nenhuma correção foi preparada. É necessário correlacionar o horário da falha com o log antes de alterar o sistema.",
    minutosSemRepetir,
  }
}

async function responderModoDesenvolvedor({ mensagem, usuario }) {
  if (!pareceComandoDesenvolvedor(mensagem)) return null
  if (usuario?.perfil !== "Administrador") return { resposta: "O Modo Desenvolvedor é restrito ao administrador.", modo: "nexa-dev-bloqueado" }
  try {
    await garantirMemoriaTecnica(usuario)
    const codigo = await responderCodigoAutonomo({ mensagem, usuario })
    if (codigo) return codigo
  } catch (error) {
    console.error("NEXA DEVELOPER CODE:", error?.message || error)
    return { resposta: `Não consegui preparar essa correção com segurança: ${String(error?.message || "falha na integração").slice(0, 250)}. Nenhuma alteração foi publicada.`, modo: "nexa-dev-codigo", atividade: "correcao-codigo", provedor: "sistema", modelo: "Nexa Developer 1.2" }
  }
  const texto = normalizar(mensagem)
  const solicitado = idIncidente(mensagem)
  if (solicitado) {
    const IncidenteSistema = require("../models/IncidenteSistema")
    const incidente = await IncidenteSistema.findByPk(solicitado)
    if (!incidente) return { resposta: `Não encontrei o incidente #${solicitado}.`, modo: "nexa-dev" }
    await incidente.update({ status: incidente.status === "Aberto" ? "Em diagnóstico" : incidente.status })
    const pedePlano = /\b(plano de correcao|prepare|preparar|corrija|corrigir|consertar|resolver)\b/.test(texto)
      && !/\b(?:nao|sem)\b[\s\S]{0,45}\b(?:prepare|preparar|corrija|corrigir|correcao|publique|publicar|altere|alterar)\b/.test(texto)
    if (!pedePlano) {
      const saude = await diagnosticoSaude()
      const natureza = avaliarNaturezaIncidente(incidente, saude)
      return {
        resposta: `Analisei o incidente #${incidente.id}.\n\n- **Tipo:** ${natureza.tipo}.\n- **Situação atual:** ${natureza.conclusao}\n- **Correção:** ${natureza.recomendacao}`,
        modo: "nexa-dev-diagnostico",
        atividade: "plano-correcao",
        provedor: "sistema",
        modelo: "Nexa Developer 1.1",
        incidenteId: incidente.id,
        incidente: { id: incidente.id, titulo: incidente.titulo, status: incidente.status, tipoFalha: natureza.tipo, categoria: incidente.categoria, causaProvavel: natureza.conclusao, diagnostico: incidente.diagnostico, precisaCorrecaoCodigo: natureza.precisaCorrecaoCodigo },
      }
    }
    const plano = await criarPlanoCorrecao({ incidente, usuario })
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

module.exports = { responderModoDesenvolvedor, pareceComandoDesenvolvedor, diagnosticoSaude, criarPlanoCorrecao, avaliarNaturezaIncidente }

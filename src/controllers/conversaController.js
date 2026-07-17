const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const CertificadoDigital = require("../models/CertificadoDigital")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")
const Usuario = require("../models/Usuario")

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const GROQ_MODELOS_URL = "https://api.groq.com/openai/v1/models"
const MODELO_PADRAO = process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
const PROVEDOR_PADRAO = String(process.env.NEXA_AI_PROVIDER || "groq").toLowerCase()


const PAGINAS_NAVEGACAO = [
  { pagina: "Dashboard", aliases: ["dashboard", "painel inicial", "pagina inicial", "inicio"] },
  { pagina: "Escritório Digital", aliases: ["escritorio digital"] },
  { pagina: "Clientes", aliases: ["cadastro de clientes", "carteira de clientes", "lista de clientes", "clientes"] },
  { pagina: "Serviços", aliases: ["servicos"] },
  { pagina: "Plano de Contas", aliases: ["plano de contas"] },
  { pagina: "Lançamentos Contábeis", aliases: ["lancamentos contabeis", "lancamentos"] },
  { pagina: "Movimentos Clientes", aliases: ["movimentos dos clientes", "movimentos clientes"] },
  { pagina: "Pendências Clientes", aliases: ["pendencias dos clientes", "pendencias clientes", "pendencias"] },
  { pagina: "Acesso Rápido Fiscal", aliases: ["acesso rapido fiscal", "atalhos fiscais"] },
  { pagina: "Documentos Digitais", aliases: ["documentos digitais", "documentos", "arquivos"] },
  { pagina: "WhatsApp Inteligente", aliases: ["whatsapp inteligente", "whatsapp"] },
  { pagina: "Assistente do Dia", aliases: ["assistente do dia", "prioridades do dia"] },
  { pagina: "Laboratório Tributário", aliases: ["laboratorio tributario", "laboratorio"] },
  { pagina: "Certificados Digitais", aliases: ["certificados digitais", "certificados", "certificado digital"] },
  { pagina: "Procurações e-CAC", aliases: ["procuracoes e-cac", "procuracoes ecac", "procuracoes"] },
  { pagina: "Identidade Digital", aliases: ["identidade digital"] },
  { pagina: "Central e-CAC", aliases: ["central e-cac", "central ecac", "e-cac", "ecac"] },
  { pagina: "Memória da Nexa", aliases: ["memoria da nexa", "memoria nexa"] },
  { pagina: "Segundo Contador", aliases: ["segundo contador"] },
  { pagina: "Consultora Tributária", aliases: ["consultora tributaria", "consultora"] },
  { pagina: "Conversa com a Nexa", aliases: ["conversa com a nexa", "nexa assist"] },
  { pagina: "Radar Inteligente", aliases: ["radar inteligente", "radar"] },
  { pagina: "Fiscal", aliases: ["modulo fiscal", "tela fiscal", "fiscal"] },
  { pagina: "Financeiro", aliases: ["modulo financeiro", "tela financeira", "financeiro"] },
  { pagina: "Relatórios", aliases: ["relatorios"] },
  { pagina: "Usuários", aliases: ["usuarios"] },
  { pagina: "Notificações", aliases: ["notificacoes"] },
  { pagina: "Agenda", aliases: ["agenda"] },
  { pagina: "Backup Sistema", aliases: ["backup do sistema", "backup sistema", "backup"] },
  { pagina: "Sobre", aliases: ["sobre a nexa", "sobre"] },
  { pagina: "Calculadora IRPF MEI", aliases: ["calculadora irpf mei", "calculadora irpf"] },
  { pagina: "DRE Gerencial", aliases: ["dre gerencial", "dre"] },
]

const PAGINAS_POR_PERFIL = {
  Administrador: new Set(PAGINAS_NAVEGACAO.map((item) => item.pagina)),
  Funcionário: new Set([
    "Dashboard", "Notificações", "Escritório Digital", "Clientes", "Lançamentos Contábeis",
    "Fiscal", "Financeiro", "Movimentos Clientes", "Pendências Clientes", "Acesso Rápido Fiscal",
    "Documentos Digitais", "WhatsApp Inteligente", "Assistente do Dia", "Laboratório Tributário",
    "Certificados Digitais", "Procurações e-CAC", "Identidade Digital", "Central e-CAC",
    "Memória da Nexa", "Segundo Contador", "Consultora Tributária", "Conversa com a Nexa",
    "Radar Inteligente", "Relatórios", "Calculadora IRPF MEI", "Agenda", "Sobre",
  ]),
  Cliente: new Set(["Documentos Digitais"]),
}
PAGINAS_POR_PERFIL.Funcionario = PAGINAS_POR_PERFIL["Funcionário"]

const PAGINAS_COM_FILTRO_CLIENTE = new Set([
  "Fiscal",
  "Documentos Digitais",
  "Pendências Clientes",
  "Movimentos Clientes",
  "Certificados Digitais",
  "Procurações e-CAC",
  "Memória da Nexa",
  "Segundo Contador",
  "Consultora Tributária",
])

const PALAVRAS_IGNORADAS_CLIENTE = new Set([
  "com", "das", "dos", "de", "da", "do", "e", "empresa", "mei", "ltda", "me",
])

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}


function escaparRegex(valor) {
  return String(valor || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function contemPalavra(texto, palavra) {
  return new RegExp(`(^|\\s)${escaparRegex(palavra)}(?=\\s|$)`).test(texto)
}

function configuracaoPaginaNoTexto(texto) {
  const candidatos = PAGINAS_NAVEGACAO
    .flatMap((item) => item.aliases.map((alias) => ({ ...item, alias: normalizar(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length)

  return candidatos.find((item) => texto.includes(item.alias)) || null
}

function pareceComandoNavegacao(texto) {
  if (configuracaoPaginaNoTexto(texto)?.alias === texto) return true

  return /(^|\s)(abra|abre|abrir|acesse|acessar|va|ir|navegue|navegar|mostre|mostrar|exiba|exibir|volte|retorne|quero ver|me leve|direcione)(\s|$)/.test(texto)
}

function pontuarClienteNoTexto(cliente, texto) {
  const nome = normalizar(nomeCliente(cliente))
  if (!nome) return 0
  if (texto.includes(nome)) return 1000 + nome.length

  const tokens = [...new Set(nome.split(/\s+/).filter((token) => token.length >= 3 && !PALAVRAS_IGNORADAS_CLIENTE.has(token)))]
  return tokens.reduce((pontos, token) => pontos + (contemPalavra(texto, token) ? token.length : 0), 0)
}

function localizarClienteNoTexto(clientes, texto) {
  const pontuados = clientes
    .map((cliente) => ({ cliente, pontos: pontuarClienteNoTexto(cliente, texto) }))
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)

  if (!pontuados.length) return { cliente: null, ambiguo: false }
  if (pontuados.length > 1 && pontuados[0].pontos === pontuados[1].pontos) {
    return { cliente: null, ambiguo: true }
  }

  return { cliente: pontuados[0].cliente, ambiguo: false }
}

function usuarioPodeAbrirPagina(usuario, pagina) {
  const perfil = usuario?.perfil || ""
  return Boolean(PAGINAS_POR_PERFIL[perfil]?.has(pagina))
}

function respostaDeComando({ resposta, acao = null }) {
  return {
    resposta,
    pontos: [],
    recomendacao: "",
    fundamentos: [],
    modo: "comando-navegacao",
    provedor: "sistema",
    modelo: "Nexa Actions 4.2",
    acao,
    respondidoEm: new Date().toISOString(),
    aviso: "Comando seguro de navegação. Nenhum dado foi alterado.",
  }
}

async function detectarComandoNavegacao({ mensagem, clienteId, usuario }) {
  const texto = normalizar(mensagem)
  if (!texto || !pareceComandoNavegacao(texto)) return null

  let clientes = await Cliente.findAll({
    attributes: ["id", "nome", "regime", "situacaoEmpresa"],
    order: [["nome", "ASC"]],
  })

  if (usuario?.perfil === "Cliente" && usuario?.clienteVinculado) {
    clientes = clientes.filter((cliente) => normalizar(nomeCliente(cliente)) === normalizar(usuario.clienteVinculado))
  }

  const clienteAtual = clienteId
    ? clientes.find((cliente) => String(cliente.id) === String(clienteId)) || null
    : null
  const localizado = localizarClienteNoTexto(clientes, texto)

  if (localizado.ambiguo) {
    return respostaDeComando({
      resposta: "Encontrei mais de um cliente compatível. Informe o nome completo para eu abrir a tela correta.",
    })
  }

  const referenciaContextual = /(esse cliente|esta empresa|desse cliente|deste cliente|cliente selecionado)/.test(texto)
  const clienteReferencia = localizado.cliente || (referenciaContextual ? clienteAtual : null)
  const querCentralCliente = /(central.*cliente|cliente.*central|cadastro.*cliente|dados.*cliente)/.test(texto)
  const mencionaClienteSingular = contemPalavra(texto, "cliente")

  let paginaEncontrada = configuracaoPaginaNoTexto(texto)
  let pagina = paginaEncontrada?.pagina || null
  let alvo = "pagina"

  if (querCentralCliente || (!pagina && localizado.cliente && pareceComandoNavegacao(texto))) {
    pagina = "Clientes"
    alvo = "central-cliente"
  } else if (pagina === "Clientes" && mencionaClienteSingular && (localizado.cliente || clienteAtual)) {
    alvo = "central-cliente"
  }

  if (!pagina) return null

  if (!usuarioPodeAbrirPagina(usuario, pagina)) {
    return respostaDeComando({
      resposta: `Seu perfil não possui permissão para abrir ${pagina}.`,
    })
  }

  let clienteAcao = clienteReferencia
  if (alvo === "central-cliente" && !clienteAcao) {
    clienteAcao = clienteAtual
  }

  if (alvo === "central-cliente" && !clienteAcao) {
    return respostaDeComando({
      resposta: "Qual cliente você quer abrir? Selecione um cliente no campo de contexto ou informe o nome na mensagem.",
    })
  }

  const acao = {
    tipo: "navegar",
    pagina,
    alvo,
    segura: true,
    cliente: clienteAcao
      ? { id: clienteAcao.id, nome: nomeCliente(clienteAcao) }
      : null,
  }

  let resposta = pagina === "Dashboard" ? "Voltando ao Dashboard." : `Abrindo ${pagina}.`
  if (alvo === "central-cliente" && clienteAcao) {
    resposta = `Abrindo a Central do Cliente de ${nomeCliente(clienteAcao)}.`
  } else if (clienteAcao && PAGINAS_COM_FILTRO_CLIENTE.has(pagina)) {
    resposta = `Abrindo ${pagina} com ${nomeCliente(clienteAcao)} selecionado.`
  }

  return respostaDeComando({ resposta, acao })
}

function encerrado(status) {
  return ["pago", "recebido", "concluido", "entregue", "quitado", "conferido"].includes(normalizar(status))
}

function diasAte(data) {
  if (!data) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(`${String(data).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(alvo.getTime())) return null
  return Math.ceil((alvo - hoje) / 86400000)
}

function nomeCliente(item) {
  return item?.nome || item?.razaoSocial || item?.nomeFantasia || "Cliente"
}

function clienteOperacional(cliente) {
  const status = normalizar(cliente?.statusOperacional || cliente?.situacaoEmpresa || cliente?.situacao)
  const regime = normalizar(cliente?.regime)
  return !["avulso", "baixada", "inapta", "suspensa", "encerrada", "pausada", "em constituicao"].includes(status) && regime !== "avulso"
}

function valorSeguro(item, campos) {
  for (const campo of campos) {
    if (item?.[campo] !== undefined && item?.[campo] !== null && item?.[campo] !== "") return item[campo]
  }
  return null
}

function resumirObrigacao(item) {
  return {
    id: item.id,
    cliente: item.cliente,
    tipo: valorSeguro(item, ["tipo", "obrigacao", "descricao", "titulo"]),
    competencia: valorSeguro(item, ["competencia", "mesReferencia"]),
    vencimento: valorSeguro(item, ["vencimento", "dataVencimento"]),
    status: item.status || "Pendente",
    diasAteVencimento: diasAte(valorSeguro(item, ["vencimento", "dataVencimento"])),
  }
}

function resumirFinanceiro(item) {
  return {
    id: item.id,
    cliente: item.cliente,
    tipo: item.tipo,
    descricao: valorSeguro(item, ["descricao", "historico", "categoria"]),
    valor: item.valor,
    vencimento: valorSeguro(item, ["vencimento", "dataVencimento"]),
    status: item.status || "Pendente",
    diasAteVencimento: diasAte(valorSeguro(item, ["vencimento", "dataVencimento"])),
  }
}

function resumirDocumento(item) {
  return {
    id: item.id,
    cliente: item.cliente,
    nome: valorSeguro(item, ["nome", "titulo", "descricao", "arquivo"]),
    tipo: item.tipo,
    status: item.status,
    criadoEm: item.createdAt,
  }
}

function resumirCertificado(item) {
  return {
    id: item.id,
    clienteId: item.clienteId,
    validade: item.dataValidade,
    diasAteVencimento: diasAte(item.dataValidade),
    autoridadeCertificadora: item.autoridadeCertificadora,
    localArquivo: item.localArquivo,
  }
}

function resumirProcuracao(item) {
  return {
    id: item.id,
    clienteId: item.clienteId,
    validade: item.dataValidade,
    diasAteVencimento: diasAte(item.dataValidade),
    servicosAutorizados: item.servicosAutorizados,
  }
}

async function montarContextoCliente(clienteId, usuario) {
  const cliente = await Cliente.findByPk(clienteId)
  if (!cliente) return null

  if (
    usuario?.perfil === "Cliente" &&
    usuario?.clienteVinculado &&
    nomeCliente(cliente) !== usuario.clienteVinculado
  ) {
    return { proibido: true }
  }

  const nome = nomeCliente(cliente)
  const [fiscais, financeiros, documentos, certificados, procuracoes] = await Promise.all([
    Fiscal.findAll({ where: { cliente: nome }, order: [["createdAt", "DESC"]], limit: 120 }),
    Financeiro.findAll({ where: { cliente: nome }, order: [["createdAt", "DESC"]], limit: 120 }),
    DocumentoDigital.findAll({ where: { cliente: nome }, order: [["createdAt", "DESC"]], limit: 80 }),
    CertificadoDigital.findAll({ where: { clienteId }, order: [["dataValidade", "DESC"]], limit: 10 }),
    ProcuracaoEcac.findAll({ where: { clienteId }, order: [["dataValidade", "DESC"]], limit: 10 }),
  ])

  return {
    escopo: "cliente",
    cliente: {
      id: cliente.id,
      nome,
      razaoSocial: cliente.razaoSocial,
      cnpj: cliente.cnpj,
      regime: cliente.regime,
      ramo: cliente.ramo,
      anexo: cliente.anexo,
      fatorR: cliente.fatorR,
      situacao: cliente.statusOperacional || cliente.situacaoEmpresa || cliente.situacao,
      municipio: cliente.municipio || cliente.cidade,
      estado: cliente.estado,
    },
    obrigacoesFiscais: fiscais.map(resumirObrigacao),
    financeiro: financeiros.map(resumirFinanceiro),
    documentos: documentos.map(resumirDocumento),
    certificados: certificados.map(resumirCertificado),
    procuracoes: procuracoes.map(resumirProcuracao),
  }
}

async function montarContextoEscritorio(usuario) {
  const [clientes, fiscais, financeiros, documentos, certificados, procuracoes] = await Promise.all([
    Cliente.findAll({ order: [["nome", "ASC"]] }),
    Fiscal.findAll({ order: [["createdAt", "DESC"]], limit: 400 }),
    Financeiro.findAll({ order: [["createdAt", "DESC"]], limit: 400 }),
    DocumentoDigital.findAll({ order: [["createdAt", "DESC"]], limit: 200 }),
    CertificadoDigital.findAll({ order: [["dataValidade", "ASC"]], limit: 200 }),
    ProcuracaoEcac.findAll({ order: [["dataValidade", "ASC"]], limit: 200 }),
  ])

  let clientesPermitidos = clientes.filter(clienteOperacional)
  if (usuario?.perfil === "Cliente" && usuario?.clienteVinculado) {
    clientesPermitidos = clientesPermitidos.filter((c) => nomeCliente(c) === usuario.clienteVinculado)
  }

  const nomesPermitidos = new Set(clientesPermitidos.map(nomeCliente))
  const idsPermitidos = new Set(clientesPermitidos.map((c) => Number(c.id)))

  return {
    escopo: "escritorio",
    clientesAtivos: clientesPermitidos.map((c) => ({
      id: c.id,
      nome: nomeCliente(c),
      regime: c.regime,
      ramo: c.ramo,
      anexo: c.anexo,
      situacao: c.statusOperacional || c.situacaoEmpresa || c.situacao,
    })),
    obrigacoesFiscais: fiscais
      .filter((i) => nomesPermitidos.has(i.cliente) && !encerrado(i.status))
      .map(resumirObrigacao),
    financeiroPendente: financeiros
      .filter((i) => nomesPermitidos.has(i.cliente) && !encerrado(i.status))
      .map(resumirFinanceiro),
    documentosRecentes: documentos
      .filter((i) => nomesPermitidos.has(i.cliente))
      .slice(0, 80)
      .map(resumirDocumento),
    certificados: certificados
      .filter((i) => idsPermitidos.has(Number(i.clienteId)))
      .map(resumirCertificado),
    procuracoes: procuracoes
      .filter((i) => idsPermitidos.has(Number(i.clienteId)))
      .map(resumirProcuracao),
  }
}


function mensagemEhSaudacao(mensagem) {
  const texto = normalizar(mensagem)
  return [
    "oi",
    "ola",
    "bom dia",
    "boa tarde",
    "boa noite",
    "tudo bem",
    "como vai",
  ].includes(texto)
}

function selecionarContextoParaPergunta(contexto, mensagem) {
  if (!contexto || typeof contexto !== "object") return contexto

  const texto = normalizar(mensagem)
  const querFiscal = /(fiscal|das|imposto|tribut|obrig|venc|pendenc)/.test(texto)
  const querFinanceiro = /(financeir|honor|receber|pagar|valor|cobranc|inadimpl)/.test(texto)
  const querDocumento = /(document|arquivo|anexo|certificado|procurac|ecac)/.test(texto)
  const querCliente = /(cliente|empresa|carteira|atencao|prioridade)/.test(texto)
  const perguntaGeral = !querFiscal && !querFinanceiro && !querDocumento && !querCliente

  if (contexto.escopo === "cliente") {
    return {
      escopo: contexto.escopo,
      cliente: contexto.cliente,
      ...(querFiscal || perguntaGeral ? { obrigacoesFiscais: (contexto.obrigacoesFiscais || []).slice(0, 18) } : {}),
      ...(querFinanceiro || perguntaGeral ? { financeiro: (contexto.financeiro || []).slice(0, 18) } : {}),
      ...(querDocumento ? { documentos: (contexto.documentos || []).slice(0, 12) } : {}),
      ...(querDocumento ? { certificados: (contexto.certificados || []).slice(0, 8) } : {}),
      ...(querDocumento ? { procuracoes: (contexto.procuracoes || []).slice(0, 8) } : {}),
    }
  }

  return {
    escopo: contexto.escopo,
    ...(querCliente || perguntaGeral ? { clientesAtivos: (contexto.clientesAtivos || []).slice(0, 30) } : {}),
    ...(querFiscal || perguntaGeral ? { obrigacoesFiscais: (contexto.obrigacoesFiscais || []).slice(0, 24) } : {}),
    ...(querFinanceiro || perguntaGeral ? { financeiroPendente: (contexto.financeiroPendente || []).slice(0, 24) } : {}),
    ...(querDocumento ? { documentosRecentes: (contexto.documentosRecentes || []).slice(0, 12) } : {}),
    ...(querDocumento ? { certificados: (contexto.certificados || []).slice(0, 12) } : {}),
    ...(querDocumento ? { procuracoes: (contexto.procuracoes || []).slice(0, 12) } : {}),
  }
}

function limparHistorico(historico) {
  if (!Array.isArray(historico)) return []
  return historico
    .slice(-14)
    .map((item) => ({
      autor: ["voce", "usuario", "user"].includes(normalizar(item?.autor)) ? "usuario" : "nexa",
      texto: String(item?.texto || "").slice(0, 2500),
    }))
    .filter((item) => item.texto)
}

function instrucoesNexa(nomeUsuario) {
  return `Você é a Nexa, assistente operacional e tributária de um escritório contábil brasileiro.
Converse em português do Brasil de forma natural, profissional, objetiva e espontânea.
Use o nome do usuário quando isso tornar a conversa mais natural: ${nomeUsuario}.
Nunca use frases prontas ou respostas genéricas quando os dados permitirem uma resposta específica.
Responda estritamente com base no CONTEXTO NEXA fornecido. Não invente clientes, datas, valores, pendências ou regras.
Quando a pergunta pedir uma lista, cite os nomes, tipos de pendência e datas disponíveis.
Diferencie vencido, vence hoje, vence em até 3 dias e vencimento futuro.
Quando os dados forem insuficientes, diga exatamente o que falta.
Você pode emitir opinião técnica, mas sempre explique o fundamento e deixe claro que a decisão final pertence ao contador.
Não afirme que enviou mensagem, alterou dados ou abriu uma tela; nesta etapa você apenas conversa e prepara a futura execução de comandos.
Retorne SOMENTE JSON válido, sem markdown, no formato:
{"resposta":"texto natural","pontos":["ponto opcional"],"recomendacao":"recomendação opcional","fundamentos":["fundamento opcional"]}`
}

function extrairTextoGroq(dados) {
  return String(dados?.choices?.[0]?.message?.content || "").trim()
}

function interpretarJson(texto) {
  const limpo = String(texto || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
  try {
    const obj = JSON.parse(limpo)
    return {
      resposta: String(obj.resposta || "Não consegui formular a resposta.").trim(),
      pontos: Array.isArray(obj.pontos) ? obj.pontos.map(String).slice(0, 12) : [],
      recomendacao: String(obj.recomendacao || "").trim(),
      fundamentos: Array.isArray(obj.fundamentos) ? obj.fundamentos.map(String).slice(0, 12) : [],
    }
  } catch {
    return { resposta: limpo || "Não consegui formular a resposta.", pontos: [], recomendacao: "", fundamentos: [] }
  }
}

async function gerarResposta({ mensagem, nomeUsuario, contexto, historico }) {
  if (PROVEDOR_PADRAO !== "groq") {
    const erro = new Error(`Provedor de IA não suportado: ${PROVEDOR_PADRAO}`)
    erro.statusCode = 503
    erro.providerFailure = true
    throw erro
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    const erro = new Error("A Groq ainda não foi configurada na API. Adicione GROQ_API_KEY nas variáveis do Render.")
    erro.statusCode = 503
    erro.providerFailure = true
    throw erro
  }

  const mensagens = [
    { role: "system", content: instrucoesNexa(nomeUsuario) },
    ...limparHistorico(historico).map((item) => ({
      role: item.autor === "usuario" ? "user" : "assistant",
      content: item.texto,
    })),
    {
      role: "user",
      content: `PERGUNTA ATUAL:
${mensagem}

CONTEXTO NEXA (dados reais do sistema):
${JSON.stringify(contexto)}`,
    },
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    const resposta = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODELO_PADRAO,
        messages: mensagens,
        max_tokens: 1200,
        temperature: 0.35,
      }),
    })

    const dados = await resposta.json().catch(() => ({}))
    if (!resposta.ok) {
      const detalhe = dados?.error?.message || `Falha da Groq (${resposta.status})`
      const erro = new Error(detalhe)
      erro.statusCode = resposta.status === 429 ? 429 : 502
      erro.providerFailure = true
      throw erro
    }

    const texto = extrairTextoGroq(dados)
    if (!texto) {
      const erro = new Error("A Groq não retornou uma resposta.")
      erro.statusCode = 502
      erro.providerFailure = true
      throw erro
    }

    return interpretarJson(texto)
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("A Groq demorou mais de 45 segundos para responder.")
      timeoutError.statusCode = 504
      timeoutError.providerFailure = true
      throw timeoutError
    }

    if (!error.statusCode) {
      error.statusCode = 502
      error.providerFailure = true
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function status(req, res) {
  const apiKey = process.env.GROQ_API_KEY
  const base = {
    provedorPrincipal: PROVEDOR_PADRAO,
    groq: {
      configurada: Boolean(apiKey),
      online: false,
      modelo: MODELO_PADRAO,
    },
    ollama: {
      tipo: "local",
      verificadoNoNavegador: true,
    },
  }

  if (PROVEDOR_PADRAO !== "groq" || !apiKey) {
    return res.json(base)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 7000)

  try {
    const resposta = await fetch(GROQ_MODELOS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    const dados = await resposta.json().catch(() => ({}))
    const modelos = Array.isArray(dados?.data) ? dados.data.map((item) => item.id) : []

    return res.json({
      ...base,
      groq: {
        ...base.groq,
        online: resposta.ok,
        modeloDisponivel: resposta.ok ? modelos.includes(MODELO_PADRAO) : false,
        mensagem: resposta.ok ? "Groq conectada" : (dados?.error?.message || `Groq respondeu com status ${resposta.status}`),
      },
    })
  } catch (error) {
    return res.json({
      ...base,
      groq: {
        ...base.groq,
        online: false,
        modeloDisponivel: false,
        mensagem: error?.name === "AbortError" ? "Tempo esgotado ao verificar a Groq" : "Não foi possível verificar a Groq",
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function contexto(req, res) {
  try {
    const mensagem = String(req.body?.mensagem || "").trim()
    const clienteId = req.body?.clienteId ? Number(req.body.clienteId) : null
    const historico = limparHistorico(req.body?.historico)

    if (!mensagem) {
      return res.status(400).json({ message: "Escreva uma pergunta para a Nexa" })
    }

    const usuarioBanco = await Usuario.findByPk(req.usuario.id)
    const nomeUsuario = usuarioBanco?.nome || "Administrador"

    if (mensagemEhSaudacao(mensagem)) {
      return res.json({
        instrucoes: "Cumprimente o usuário naturalmente em português do Brasil. Seja breve e não analise dados do ERP nesta resposta.",
        contexto: { escopo: "saudacao", usuario: { nome: nomeUsuario } },
        historico,
        usuario: { nome: nomeUsuario },
        geradoEm: new Date().toISOString(),
      })
    }

    const contextoCompleto = clienteId
      ? await montarContextoCliente(clienteId, req.usuario)
      : await montarContextoEscritorio(req.usuario)

    if (!contextoCompleto) {
      return res.status(404).json({ message: "Cliente não encontrado" })
    }

    if (contextoCompleto.proibido) {
      return res.status(403).json({ message: "Acesso não autorizado" })
    }

    const contextoNexa = selecionarContextoParaPergunta(contextoCompleto, mensagem)

    return res.json({
      instrucoes: instrucoesNexa(nomeUsuario)
        .replace(/Retorne SOMENTE JSON válido[\s\S]*$/m, "")
        .trim(),
      contexto: contextoNexa,
      historico,
      usuario: { nome: nomeUsuario },
      geradoEm: new Date().toISOString(),
    })
  } catch (error) {
    console.error("ERRO AO MONTAR CONTEXTO DA NEXA:", error)
    return res.status(500).json({
      message: error.message || "Erro ao montar contexto da Nexa",
    })
  }
}

async function conversar(req, res) {
  try {
    const mensagem = String(req.body?.mensagem || "").trim()
    const clienteId = req.body?.clienteId ? Number(req.body.clienteId) : null
    const historico = req.body?.historico

    if (!mensagem) return res.status(400).json({ message: "Escreva uma pergunta para a Nexa" })

    const usuarioBanco = await Usuario.findByPk(req.usuario.id)
    const nomeUsuario = usuarioBanco?.nome || "Administrador"
    const usuarioCompleto = {
      ...(req.usuario || {}),
      ...(usuarioBanco?.toJSON?.() || {}),
    }

    const comandoNavegacao = await detectarComandoNavegacao({
      mensagem,
      clienteId,
      usuario: usuarioCompleto,
    })

    if (comandoNavegacao) {
      return res.json(comandoNavegacao)
    }

    const contextoCompleto = clienteId
      ? await montarContextoCliente(clienteId, req.usuario)
      : await montarContextoEscritorio(req.usuario)

    if (!contextoCompleto) return res.status(404).json({ message: "Cliente não encontrado" })
    if (contextoCompleto.proibido) return res.status(403).json({ message: "Acesso não autorizado" })

    const contextoNexa = selecionarContextoParaPergunta(contextoCompleto, mensagem)
    const resultado = await gerarResposta({ mensagem, nomeUsuario, contexto: contextoNexa, historico })

    return res.json({
      ...resultado,
      modo: "groq-online",
      provedor: "groq",
      modelo: MODELO_PADRAO,
      respondidoEm: new Date().toISOString(),
      aviso: "A resposta utiliza os dados disponíveis na Nexa e apoia, mas não substitui, a decisão profissional do contador.",
    })
  } catch (error) {
    console.error("ERRO NA CONVERSA GENERATIVA DA NEXA:", error)
    return res.status(error.statusCode || 500).json({
      message: error.message || "Erro ao conversar com a Nexa",
      providerFailure: Boolean(error.providerFailure),
      provedor: PROVEDOR_PADRAO,
    })
  }
}

module.exports = { conversar, contexto, status }

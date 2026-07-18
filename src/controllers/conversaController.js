const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const CertificadoDigital = require("../models/CertificadoDigital")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")
const Usuario = require("../models/Usuario")
const ConversaNexa = require("../models/ConversaNexa")
const MensagemNexa = require("../models/MensagemNexa")
const { detectarConsultaInteligente } = require("../services/consultaInteligenteService")
const {
  detectarPedidoMemoria,
  registrarMemoria,
  esquecerMemoria,
  obterMemoriasRelevantes,
} = require("../services/memoriaEvolutivaService")
const { tituloAutomatico } = require("./conversaHistoricoController")

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const GROQ_MODELOS_URL = "https://api.groq.com/openai/v1/models"
const MODELO_PADRAO = process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
const MODELO_PESQUISA_WEB_CONFIGURADO = process.env.GROQ_WEB_MODEL || "groq/compound"
const MODELO_PESQUISA_WEB = String(MODELO_PESQUISA_WEB_CONFIGURADO).startsWith("groq/compound")
  ? MODELO_PESQUISA_WEB_CONFIGURADO
  : "groq/compound"
const PESQUISA_WEB_ATIVA = String(process.env.NEXA_WEB_SEARCH_ENABLED || "true").toLowerCase() !== "false"
const PROVEDOR_PADRAO = String(process.env.NEXA_AI_PROVIDER || "groq").toLowerCase()


const PAGINAS_NAVEGACAO = [
  { pagina: "Dashboard", aliases: ["dashboard", "dash board", "dasboard", "painel inicial", "tela inicial", "pagina inicial", "inicio", "home"] },
  { pagina: "Escritório Digital", aliases: ["escritorio digital"] },
  { pagina: "Clientes", aliases: ["cadastro de clientes", "carteira de clientes", "lista de clientes", "clientes"] },
  { pagina: "Serviços", aliases: ["servicos"] },
  { pagina: "Plano de Contas", aliases: ["plano de contas"] },
  { pagina: "Lançamentos Contábeis", aliases: ["lancamentos contabeis", "lancamentos"] },
  { pagina: "Movimentos Clientes", aliases: ["movimentacoes desta empresa", "movimentacoes da empresa", "movimentacoes do cliente", "movimentacoes dos clientes", "movimentacoes clientes", "movimentos desta empresa", "movimentos da empresa", "movimentos do cliente", "movimentos dos clientes", "movimentos clientes", "movimentacoes", "movimentos"] },
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
  { pagina: "Financeiro", aliases: ["meu financeiro", "financeiro do escritorio", "modulo financeiro", "tela financeira", "financeiro"] },
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
  const paginaEncontrada = configuracaoPaginaNoTexto(texto)
  if (!paginaEncontrada) return false
  if (paginaEncontrada.alias === texto) return true

  return /(^|\s)(abra|abre|abri|abrir|acessa|acesse|acessar|entra|entre|entrar|vai|va|ir|navega|navegue|navegar|mostra|mostre|mostrar|exiba|exibir|volta|volte|voltar|voltando|volto|retorna|retorne|retornar|quero ir|quero ver|me leva|me leve|direciona|direcione)(\s|$)/.test(texto)
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

  const referenciaContextual = /(esse cliente|este cliente|o mesmo cliente|do mesmo cliente|desse cliente|deste cliente|cliente selecionado|essa empresa|esta empresa|a mesma empresa|da mesma empresa|dessa empresa|desta empresa|desta mesma empresa|dela|dele)/.test(texto)
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


function perguntaPedeDetalhes(mensagem) {
  const texto = normalizar(mensagem)
  return /(explique|detalhe|detalhes|por que|porque|como funciona|quais regras|aprofund|passo a passo|me fale mais|complete|fundament)/.test(texto)
}

const TEMA_PROFISSIONAL_ATUALIZAVEL = /(inss|previden|gps|carne|contribui|segurado|aposent|beneficio|salario minimo|mei|simples nacional|pgdas|das|defis|dctf|receita federal|imposto|tribut|aliquota|cnae|ncm|cfop|cst|csosn|iss|icms|ipi|irpf|irpj|csll|pis|cofins|folha|trabalh|empregad|admiss|demiss|ferias|decimo terceiro|fgts|esocial|e-social|seguro desemprego|licenca|afastamento|legisl|lei|decreto|portaria|instrucao normativa|obrigacao acessoria|prazo fiscal)/
const PERGUNTA_FATUAL_OU_NORMATIVA = /(qual|quais|quanto|quantos|codigo|categoria|aliquota|valor|limite|prazo|vencimento|tabela|regra|requisito|quem tem direito|pode|precisa|deve|obrigatorio|como calcular|como recolher|como pagar|o que e|oque e|significa|vigente|atual)/
const INDICIO_ATUALIDADE = /(hoje|agora|atual|atualmente|vigente|este ano|neste ano|202[0-9]|ultima atualizacao|mais recente|novo valor|nova regra)/
const CONTINUACAO_CURTA = /^(e |e o |e a |qual |quais |quanto |quantos |esse |essa |isso |como |por que |porque )/

function perguntaExigePesquisaWeb(mensagem, historico = []) {
  if (!PESQUISA_WEB_ATIVA || mensagemEhConversaCasual(mensagem)) return false

  const textoAtual = normalizar(mensagem)
  const saudacaoSemAssuntoProfissional = /^(oi|ola|bom dia|boa tarde|boa noite)(\s|,|!|$)/.test(textoAtual)
    && !TEMA_PROFISSIONAL_ATUALIZAVEL.test(textoAtual)
  if (saudacaoSemAssuntoProfissional) return false

  const historicoRecente = limparHistorico(historico)
    .slice(-6)
    .map((item) => normalizar(item.texto))
    .join(" ")

  const temaAtual = TEMA_PROFISSIONAL_ATUALIZAVEL.test(textoAtual)
  const perguntaFactual = PERGUNTA_FATUAL_OU_NORMATIVA.test(textoAtual)
  const temaNoHistorico = TEMA_PROFISSIONAL_ATUALIZAVEL.test(historicoRecente)
  const continuacaoDoAssunto = CONTINUACAO_CURTA.test(textoAtual) && temaNoHistorico

  return (temaAtual && perguntaFactual) || continuacaoDoAssunto || INDICIO_ATUALIDADE.test(textoAtual)
}

function pesquisaDeveUsarSomenteFontesOficiais(mensagem, historico = []) {
  const texto = `${normalizar(mensagem)} ${limparHistorico(historico).slice(-6).map((item) => normalizar(item.texto)).join(" ")}`
  return TEMA_PROFISSIONAL_ATUALIZAVEL.test(texto)
}

function perguntaPrecisaDadosNexa(mensagem, clienteId, tipoContexto) {
  if (clienteId || tipoContexto === "cliente") return true
  const texto = normalizar(mensagem)
  return /(meus? clientes?|cliente cadastrado|escritorio|nexa|pendenc|venciment|financeir|honorario|documentos? digitais|certificado|procuracao|fiscal|agenda|assistente do dia|dashboard|movimentos? cliente|central do cliente)/.test(texto)
}

function respostaObjetivaAntesDaPesquisa(mensagem) {
  const texto = normalizar(mensagem)

  const perguntaCalculoSimples = (
    /(quanto|qual(?: e| o)? valor|calcule|calcular|estimativa).*(imposto|das).*(simples nacional|simples)/.test(texto)
    || /(simples nacional|simples).*(quanto|qual(?: e| o)? valor|calcule|calcular|estimativa).*(imposto|das)/.test(texto)
  )

  if (perguntaCalculoSimples) {
    const informouAtividade = /(atividade|cnae|anexo|comercio|comercial|industria|industrial|servico|servicos|profissao|fator r)/.test(texto)

    if (!informouAtividade) {
      return {
        resposta: "Qual é a atividade da empresa?",
        pontos: [],
        recomendacao: "",
        fundamentos: [],
        confirmado: true,
        pesquisaWeb: false,
        modeloUsado: "Nexa Consultoria Objetiva",
      }
    }
  }

  return null
}

function contextoLivre({ nomeUsuario, tipoContexto, interessadoNome, memorias }) {
  return {
    escopo: tipoContexto === "interessado" ? "novo_atendimento" : "consultoria_livre",
    usuario: { nome: nomeUsuario },
    interessado: tipoContexto === "interessado"
      ? { identificacao: interessadoNome || "Novo atendimento", cadastrado: false }
      : null,
    memorias,
    dataHoraBrasil: dataHoraBrasil(),
  }
}

async function obterOuCriarConversa({ usuarioId, conversaId, tipoContexto, clienteId, interessadoNome, primeiraMensagem }) {
  let conversa = null
  if (conversaId) {
    conversa = await ConversaNexa.findOne({ where: { id: conversaId, usuarioId } })
  }

  if (!conversa) {
    conversa = await ConversaNexa.create({
      usuarioId,
      titulo: tituloAutomatico(primeiraMensagem),
      tipoContexto: ["geral", "cliente", "interessado"].includes(tipoContexto) ? tipoContexto : (clienteId ? "cliente" : "geral"),
      clienteId: clienteId || null,
      interessadoNome: tipoContexto === "interessado" ? String(interessadoNome || "Novo atendimento").trim() : null,
      ultimaMensagemEm: new Date(),
    })
  } else {
    const atualizacoes = { ultimaMensagemEm: new Date() }
    if (conversa.titulo === "Nova conversa") atualizacoes.titulo = tituloAutomatico(primeiraMensagem)
    if (["geral", "cliente", "interessado"].includes(tipoContexto)) atualizacoes.tipoContexto = tipoContexto
    if (clienteId !== undefined) atualizacoes.clienteId = clienteId || null
    if (tipoContexto === "interessado") atualizacoes.interessadoNome = String(interessadoNome || conversa.interessadoNome || "Novo atendimento").trim()
    await conversa.update(atualizacoes)
  }

  return conversa
}

async function historicoPersistente(conversaId, usuarioId, limite = 18) {
  if (!conversaId) return []
  const mensagens = await MensagemNexa.findAll({
    where: { conversaId, usuarioId },
    order: [["createdAt", "DESC"]],
    limit: Math.max(1, Math.min(Number(limite) || 18, 30)),
  })
  return mensagens.reverse().map((item) => ({
    autor: item.autor === "usuario" ? "usuario" : "nexa",
    texto: item.texto,
  }))
}

async function salvarMensagemConversa({ conversa, usuarioId, autor, texto, dados = null }) {
  if (!conversa || !texto) return null
  const mensagem = await MensagemNexa.create({
    conversaId: conversa.id,
    usuarioId,
    autor,
    texto: String(texto),
    dados,
  })
  await conversa.update({ ultimaMensagemEm: new Date() })
  return mensagem
}

function anexarMetadadosConversa(resposta, conversa, extra = {}) {
  return {
    ...resposta,
    conversaId: conversa?.id || null,
    conversaTitulo: conversa?.titulo || "Nova conversa",
    tipoContexto: conversa?.tipoContexto || "geral",
    ...extra,
  }
}

function mensagemEhConversaCasual(mensagem) {
  const texto = normalizar(mensagem)
    .replace(/[!?.,;:]+$/g, "")
    .trim()

  return [
    "oi",
    "ola",
    "bom dia",
    "boa tarde",
    "boa noite",
    "tudo bem",
    "como vai",
    "como voce esta",
    "como voce ta",
    "quem e voce",
    "obrigado",
    "obrigada",
    "valeu",
    "ate logo",
  ].includes(texto)
}

function dataHoraBrasil() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date())
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

function instrucoesNexa(nomeUsuario, { conversaCasual = false, respostaCurta = true } = {}) {
  const personalidade = `Você é a Nexa, assistente e parceira de um escritório contábil brasileiro.
Converse em português do Brasil com naturalidade, espontaneidade, segurança e profissionalismo.
Use o nome do usuário somente quando soar natural: ${nomeUsuario}.
Evite bordões, respostas engessadas, frases repetidas e apresentações desnecessárias.
Você pode conversar sobre clientes cadastrados, novos interessados e dúvidas gerais, sem exigir que exista um cliente selecionado.`

  const regraDeConcisao = respostaCurta
    ? `REGRA PRINCIPAL: responda somente o que foi perguntado, da forma mais curta possível.
Para pergunta objetiva, responda com poucas palavras ou uma única frase.
Exemplo: “Qual a categoria do código 1163 do INSS?” Resposta: “Contribuinte individual.”
Não acrescente alíquota, exceção, alerta, fundamento, recomendação ou explicação sem o usuário pedir.
Deixe pontos, recomendacao e fundamentos vazios em respostas objetivas.`
    : `O usuário pediu aprofundamento. Explique com clareza, mas sem enrolação. Organize apenas quando isso realmente ajudar.`

  const regrasDoModo = conversaCasual
    ? `Esta é uma conversa casual. Responda livre e naturalmente, sem transformar saudação em relatório e sem usar resposta pré-programada.`
    : `Use o CONTEXTO NEXA quando ele for relevante. Não invente clientes, datas, valores, pendências ou informações.
Em consulta livre, responda pela sua capacidade de orientação geral. Se não tiver segurança suficiente, diga apenas que precisa confirmar a informação.
Quando houver memórias, use-as discretamente e sem anunciar que está consultando memória.
Você pode orientar e preparar respostas, mas nunca afirme que alterou, excluiu, enviou ou concluiu dados.`

  return `${personalidade}
${regraDeConcisao}
${regrasDoModo}
Retorne SOMENTE JSON válido, sem markdown, no formato:
{"resposta":"texto natural","pontos":[],"recomendacao":"","fundamentos":[]}`
}
function extrairTextoGroq(dados) {
  return String(dados?.choices?.[0]?.message?.content || "").trim()
}

function interpretarJson(texto) {
  const limpo = String(texto || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
  const inicioJson = limpo.indexOf("{")
  const fimJson = limpo.lastIndexOf("}")
  const candidatos = [limpo]

  if (inicioJson >= 0 && fimJson > inicioJson) {
    candidatos.push(limpo.slice(inicioJson, fimJson + 1))
  }

  for (const candidato of candidatos) {
    try {
      const obj = JSON.parse(candidato)
      return {
        resposta: String(obj.resposta || "Não consegui formular a resposta.").trim(),
        pontos: Array.isArray(obj.pontos) ? obj.pontos.map(String).slice(0, 12) : [],
        recomendacao: String(obj.recomendacao || "").trim(),
        fundamentos: Array.isArray(obj.fundamentos) ? obj.fundamentos.map(String).slice(0, 12) : [],
        confirmado: typeof obj.confirmado === "boolean" ? obj.confirmado : undefined,
      }
    } catch {
      // Tenta o próximo formato. Alguns modelos acrescentam uma frase antes do JSON.
    }
  }

  const textoAntesDoJson = inicioJson > 0 ? limpo.slice(0, inicioJson).trim() : ""
  return {
    resposta: textoAntesDoJson || limpo || "Não consegui formular a resposta.",
    pontos: [],
    recomendacao: "",
    fundamentos: [],
  }
}

async function gerarRespostaPadrao({ mensagem, nomeUsuario, contexto, historico, conversaCasual = false, respostaCurta = true }) {
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
    { role: "system", content: instrucoesNexa(nomeUsuario, { conversaCasual, respostaCurta }) },
    ...limparHistorico(historico).map((item) => ({
      role: item.autor === "usuario" ? "user" : "assistant",
      content: item.texto,
    })),
    {
      role: "user",
      content: `PERGUNTA ATUAL:
${mensagem}

CONTEXTO DA CONVERSA:
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
        max_tokens: respostaCurta ? 320 : 1200,
        temperature: conversaCasual ? 0.9 : (respostaCurta ? 0.45 : 0.55),
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

function dominioDaUrl(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

function dominioEhOficialBrasileiro(url) {
  const dominio = dominioDaUrl(url)
  return dominio === "gov.br" || dominio.endsWith(".gov.br") || dominio.endsWith(".jus.br") || dominio.endsWith(".leg.br")
}

function extrairFontesDaPesquisa(dados, somenteOficiais = false) {
  const ferramentas = dados?.choices?.[0]?.message?.executed_tools
  if (!Array.isArray(ferramentas)) return []

  const fontes = []
  const urlsVistas = new Set()

  for (const ferramenta of ferramentas) {
    const pesquisa = ferramenta?.search_results
    const resultados = Array.isArray(pesquisa) ? pesquisa : pesquisa?.results
    if (!Array.isArray(resultados)) continue

    for (const item of resultados) {
      const url = String(item?.url || "").trim()
      if (!url || urlsVistas.has(url)) continue
      if (somenteOficiais && !dominioEhOficialBrasileiro(url)) continue

      urlsVistas.add(url)
      fontes.push({
        titulo: String(item?.title || dominioDaUrl(url) || "Fonte consultada").trim(),
        url,
        dominio: dominioDaUrl(url),
      })

      if (fontes.length >= 5) return fontes
    }
  }

  return fontes
}

function instrucoesPesquisaWeb(nomeUsuario, { respostaCurta = true, somenteOficiais = false } = {}) {
  const fontes = somenteOficiais
    ? `Pesquise obrigatoriamente em fontes oficiais brasileiras. Priorize gov.br, Receita Federal, INSS, Planalto, eSocial, Caixa/FGTS, órgãos estaduais e municipais, tribunais e casas legislativas. Não use blog, fórum ou site comercial como base da resposta.`
    : `Pesquise obrigatoriamente na internet antes de responder. Priorize fontes primárias, oficiais e reconhecidas.`

  const concisao = respostaCurta
    ? `Responda somente o que foi perguntado. Se pedirem apenas a categoria, responda apenas a categoria. Se pedirem código e valor, responda apenas o código e o valor. Não dê aula, não acrescente alertas e não explique regras sem solicitação.`
    : `O usuário pediu detalhes. Explique com clareza, apoiando cada afirmação relevante nas fontes encontradas.`

  return `Você é a Nexa, assistente contábil de ${nomeUsuario}.
${fontes}
${concisao}
Nunca chute código, alíquota, valor, prazo, categoria ou regra.
Se a pesquisa não confirmar a resposta com segurança, use exatamente: “Não consegui confirmar essa informação com segurança.”
Não inclua links, citações ou nomes de fontes dentro do texto da resposta; as fontes serão exibidas separadamente pelo sistema.
Retorne SOMENTE JSON válido, sem markdown, no formato:
{"resposta":"texto","pontos":[],"recomendacao":"","fundamentos":[],"confirmado":true}`
}

async function gerarRespostaComPesquisa({ mensagem, nomeUsuario, contexto, historico, respostaCurta = true }) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return {
      resposta: "Não consegui confirmar essa informação com segurança.",
      pontos: [],
      recomendacao: "",
      fundamentos: [],
      confirmado: false,
      pesquisaWeb: true,
      fontes: [],
      modeloUsado: MODELO_PESQUISA_WEB,
    }
  }

  const somenteOficiais = pesquisaDeveUsarSomenteFontesOficiais(mensagem, historico)
  const pergunta = String(mensagem || "").trim().slice(0, 1000)
  const regraFontes = somenteOficiais
    ? "Pesquise exclusivamente em fontes oficiais brasileiras, principalmente gov.br, INSS, Receita Federal, Planalto, eSocial, Caixa, tribunais e casas legislativas."
    : "Pesquise na internet e priorize fontes primárias, oficiais e reconhecidas."
  const regraResposta = respostaCurta
    ? "Responda somente o que foi perguntado, em uma frase curta. Não dê explicações adicionais."
    : "Explique com clareza, mas sem informações desnecessárias."

  // Payload mínimo, seguindo o quickstart oficial do Groq Compound.
  // Não envia histórico, dados de clientes, memórias, contexto interno nem opções extras.
  const promptPesquisa = `${regraFontes}
${regraResposta}
Nunca chute códigos, valores, alíquotas, categorias, prazos ou regras.
Se não encontrar confirmação segura, responda exatamente: Não consegui confirmar essa informação com segurança.
Retorne SOMENTE JSON válido, sem markdown e sem links, no formato:
{"resposta":"texto","pontos":[],"recomendacao":"","fundamentos":[],"confirmado":true}

Pergunta: ${pergunta}`

  // Para pesquisa web, use apenas sistemas Compound. Modelos comuns não
  // possuem pesquisa embutida e podem consumir o limite de tokens sem
  // conseguir validar a informação.
  const modelos = [...new Set([
    MODELO_PESQUISA_WEB,
    "groq/compound",
  ].filter(Boolean))]

  for (const modelo of modelos) {
    const corpo = {
      model: modelo,
      messages: [{ role: "user", content: promptPesquisa }],
    }
    const corpoSerializado = JSON.stringify(corpo)
    const tamanhoBytes = Buffer.byteLength(corpoSerializado, "utf8")
    console.log(`PESQUISA WEB DA NEXA: modelo=${modelo} payload=${tamanhoBytes} bytes`)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    try {
      const resposta = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: corpoSerializado,
      })

      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) {
        console.error(
          `FALHA NA PESQUISA WEB DA NEXA (${modelo}, ${resposta.status}, ${tamanhoBytes} bytes):`,
          dados?.error?.message || resposta.status,
        )
        continue
      }

      const fontes = extrairFontesDaPesquisa(dados, somenteOficiais)
      const texto = extrairTextoGroq(dados)
      const interpretado = interpretarJson(texto)
      const confirmouComFonte = fontes.length > 0 && interpretado.confirmado !== false

      if (!texto || !confirmouComFonte) {
        console.error(
          `PESQUISA WEB SEM FONTE VÁLIDA (${modelo}):`,
          `fontes=${fontes.length}, texto=${Boolean(texto)}`,
        )
        continue
      }

      return {
        ...interpretado,
        confirmado: true,
        pesquisaWeb: true,
        fontes,
        somenteFontesOficiais: somenteOficiais,
        modeloUsado: modelo,
      }
    } catch (error) {
      console.error(`ERRO NA PESQUISA WEB DA NEXA (${modelo}):`, error?.message || error)
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    resposta: "Não consegui confirmar essa informação com segurança.",
    pontos: [],
    recomendacao: "",
    fundamentos: [],
    confirmado: false,
    pesquisaWeb: true,
    fontes: [],
    modeloUsado: MODELO_PESQUISA_WEB,
  }
}

async function gerarResposta(parametros) {
  const respostaObjetiva = respostaObjetivaAntesDaPesquisa(parametros.mensagem)
  if (respostaObjetiva) return respostaObjetiva

  const usarPesquisa = perguntaExigePesquisaWeb(parametros.mensagem, parametros.historico)
  if (usarPesquisa) return gerarRespostaComPesquisa(parametros)
  return gerarRespostaPadrao(parametros)
}

async function status(req, res) {
  const apiKey = process.env.GROQ_API_KEY
  const base = {
    provedorPrincipal: PROVEDOR_PADRAO,
    groq: {
      configurada: Boolean(apiKey),
      online: false,
      modelo: MODELO_PADRAO,
      pesquisaWebAtiva: PESQUISA_WEB_ATIVA,
      modeloPesquisaWeb: MODELO_PESQUISA_WEB,
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
    const conversaId = req.body?.conversaId ? Number(req.body.conversaId) : null
    const tipoContexto = ["geral", "cliente", "interessado"].includes(req.body?.tipoContexto)
      ? req.body.tipoContexto
      : (clienteId ? "cliente" : "geral")
    const interessadoNome = String(req.body?.interessadoNome || "").trim()
    const respostaCurta = !perguntaPedeDetalhes(mensagem)

    if (!mensagem) {
      return res.status(400).json({ message: "Escreva uma pergunta para a Nexa" })
    }

    const usuarioBanco = await Usuario.findByPk(req.usuario.id)
    const nomeUsuario = usuarioBanco?.nome || "Administrador"
    const persistido = conversaId ? await historicoPersistente(conversaId, req.usuario.id) : []
    const historico = persistido.length ? persistido : limparHistorico(req.body?.historico)
    const memorias = await obterMemoriasRelevantes({
      usuarioId: req.usuario.id,
      clienteId,
      conversaId,
      tipoContexto,
    })
    const conversaCasual = mensagemEhConversaCasual(mensagem)

    let contextoNexa
    if (conversaCasual || tipoContexto === "interessado" || !perguntaPrecisaDadosNexa(mensagem, clienteId, tipoContexto)) {
      contextoNexa = contextoLivre({ nomeUsuario, tipoContexto, interessadoNome, memorias })
      if (conversaCasual) contextoNexa.escopo = "conversa_casual"
    } else {
      const contextoCompleto = clienteId
        ? await montarContextoCliente(clienteId, req.usuario)
        : await montarContextoEscritorio(req.usuario)

      if (!contextoCompleto) return res.status(404).json({ message: "Cliente não encontrado" })
      if (contextoCompleto.proibido) return res.status(403).json({ message: "Acesso não autorizado" })

      contextoNexa = {
        ...selecionarContextoParaPergunta(contextoCompleto, mensagem),
        memorias,
      }
    }

    return res.json({
      instrucoes: instrucoesNexa(nomeUsuario, { conversaCasual, respostaCurta })
        .replace(/Retorne SOMENTE JSON válido[\s\S]*$/m, "")
        .trim(),
      contexto: contextoNexa,
      historico,
      usuario: { nome: nomeUsuario },
      conversaId,
      tipoContexto,
      interessadoNome,
      respostaCurta,
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
  let conversa = null

  try {
    const mensagem = String(req.body?.mensagem || "").trim()
    const clienteId = req.body?.clienteId ? Number(req.body.clienteId) : null
    const conversaId = req.body?.conversaId ? Number(req.body.conversaId) : null
    const tipoContexto = ["geral", "cliente", "interessado"].includes(req.body?.tipoContexto)
      ? req.body.tipoContexto
      : (clienteId ? "cliente" : "geral")
    const interessadoNome = String(req.body?.interessadoNome || "").trim()

    if (!mensagem) return res.status(400).json({ message: "Escreva uma pergunta para a Nexa" })

    const usuarioBanco = await Usuario.findByPk(req.usuario.id)
    const nomeUsuario = usuarioBanco?.nome || "Administrador"
    const usuarioCompleto = {
      ...(req.usuario || {}),
      ...(usuarioBanco?.toJSON?.() || {}),
    }

    conversa = await obterOuCriarConversa({
      usuarioId: req.usuario.id,
      conversaId,
      tipoContexto,
      clienteId,
      interessadoNome,
      primeiraMensagem: mensagem,
    })

    const historicoBanco = await historicoPersistente(conversa.id, req.usuario.id)
    const historico = historicoBanco.length ? historicoBanco : limparHistorico(req.body?.historico)

    await salvarMensagemConversa({
      conversa,
      usuarioId: req.usuario.id,
      autor: "usuario",
      texto: mensagem,
    })

    const pedidoMemoria = detectarPedidoMemoria(mensagem)
    if (pedidoMemoria?.tipo === "lembrar") {
      const resultadoMemoria = await registrarMemoria({
        usuarioId: req.usuario.id,
        clienteId,
        conversaId: conversa.id,
        tipoContexto: conversa.tipoContexto,
        conteudo: pedidoMemoria.conteudo,
      })

      let textoResposta = "Certo. Vou lembrar disso."
      if (!resultadoMemoria.registrada && resultadoMemoria.motivo === "sensivel") {
        textoResposta = "Não vou guardar senhas, chaves ou credenciais."
      } else if (resultadoMemoria.duplicada) {
        textoResposta = "Isso já está na minha memória."
      }

      await salvarMensagemConversa({
        conversa,
        usuarioId: req.usuario.id,
        autor: "nexa",
        texto: textoResposta,
        dados: { memoriaRegistrada: Boolean(resultadoMemoria.registrada) },
      })

      return res.json(anexarMetadadosConversa({
        resposta: textoResposta,
        pontos: [],
        recomendacao: "",
        fundamentos: [],
        modo: "memoria-evolutiva",
        provedor: "sistema",
        modelo: "Nexa Memory 1.0",
        respondidoEm: new Date().toISOString(),
      }, conversa, {
        memoriaRegistrada: Boolean(resultadoMemoria.registrada),
      }))
    }

    if (pedidoMemoria?.tipo === "esquecer") {
      const resultado = await esquecerMemoria({
        usuarioId: req.usuario.id,
        clienteId,
        conversaId: conversa.id,
        termo: pedidoMemoria.conteudo,
      })
      const textoResposta = resultado.removidas
        ? "Certo. Esqueci essa informação."
        : "Não encontrei essa informação na memória."

      await salvarMensagemConversa({
        conversa,
        usuarioId: req.usuario.id,
        autor: "nexa",
        texto: textoResposta,
      })

      return res.json(anexarMetadadosConversa({
        resposta: textoResposta,
        pontos: [],
        recomendacao: "",
        fundamentos: [],
        modo: "memoria-evolutiva",
        provedor: "sistema",
        modelo: "Nexa Memory 1.0",
        respondidoEm: new Date().toISOString(),
      }, conversa))
    }

    const comandoNavegacao = await detectarComandoNavegacao({
      mensagem,
      clienteId,
      usuario: usuarioCompleto,
    })

    if (comandoNavegacao) {
      await salvarMensagemConversa({
        conversa,
        usuarioId: req.usuario.id,
        autor: "nexa",
        texto: comandoNavegacao.resposta,
        dados: comandoNavegacao,
      })
      return res.json(anexarMetadadosConversa(comandoNavegacao, conversa))
    }

    if (conversa.tipoContexto !== "interessado") {
      const consultaInteligente = await detectarConsultaInteligente({
        mensagem,
        clienteId,
        usuario: usuarioCompleto,
      })

      if (consultaInteligente) {
        await salvarMensagemConversa({
          conversa,
          usuarioId: req.usuario.id,
          autor: "nexa",
          texto: consultaInteligente.resposta,
          dados: consultaInteligente,
        })
        return res.json(anexarMetadadosConversa(consultaInteligente, conversa))
      }
    }

    const conversaCasual = mensagemEhConversaCasual(mensagem)
    const respostaCurta = !perguntaPedeDetalhes(mensagem)
    const memorias = await obterMemoriasRelevantes({
      usuarioId: req.usuario.id,
      clienteId,
      conversaId: conversa.id,
      tipoContexto: conversa.tipoContexto,
    })

    let contextoNexa
    if (conversaCasual || conversa.tipoContexto === "interessado" || !perguntaPrecisaDadosNexa(mensagem, clienteId, conversa.tipoContexto)) {
      contextoNexa = contextoLivre({
        nomeUsuario,
        tipoContexto: conversa.tipoContexto,
        interessadoNome: conversa.interessadoNome,
        memorias,
      })
      if (conversaCasual) contextoNexa.escopo = "conversa_casual"
    } else {
      const contextoCompleto = clienteId
        ? await montarContextoCliente(clienteId, req.usuario)
        : await montarContextoEscritorio(req.usuario)

      if (!contextoCompleto) return res.status(404).json({ message: "Cliente não encontrado" })
      if (contextoCompleto.proibido) return res.status(403).json({ message: "Acesso não autorizado" })

      contextoNexa = {
        ...selecionarContextoParaPergunta(contextoCompleto, mensagem),
        memorias,
      }
    }

    const resultado = await gerarResposta({
      mensagem,
      nomeUsuario,
      contexto: contextoNexa,
      historico,
      conversaCasual,
      respostaCurta,
    })

    const respostaFinal = {
      ...resultado,
      modo: resultado.pesquisaWeb ? "groq-pesquisa-web" : "groq-online",
      provedor: "groq",
      modelo: resultado.modeloUsado || MODELO_PADRAO,
      respondidoEm: new Date().toISOString(),
      memoriaAtiva: true,
      memoriasUsadas: memorias.length,
      aviso: resultado.pesquisaWeb
        ? (resultado.confirmado
          ? "Resposta confirmada por pesquisa na internet."
          : "A informação não foi respondida sem confirmação segura.")
        : "A Nexa responde de forma objetiva e aprofunda apenas quando solicitado.",
    }

    await salvarMensagemConversa({
      conversa,
      usuarioId: req.usuario.id,
      autor: "nexa",
      texto: resultado.resposta,
      dados: respostaFinal,
    })

    return res.json(anexarMetadadosConversa(respostaFinal, conversa))
  } catch (error) {
    console.error("ERRO NA CONVERSA GENERATIVA DA NEXA:", error)
    return res.status(error.statusCode || 500).json({
      message: error.message || "Erro ao conversar com a Nexa",
      providerFailure: Boolean(error.providerFailure),
      provedor: PROVEDOR_PADRAO,
      conversaId: conversa?.id || null,
      conversaTitulo: conversa?.titulo || null,
    })
  }
}
module.exports = { conversar, contexto, status }

const { Op } = require("sequelize")
const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const CertificadoDigital = require("../models/CertificadoDigital")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")
const ServicoAvulso = require("../models/ServicoAvulso")
const Usuario = require("../models/Usuario")
const ConversaNexa = require("../models/ConversaNexa")
const MensagemNexa = require("../models/MensagemNexa")
const { detectarConsultaInteligente } = require("../services/consultaInteligenteService")
const { classificarMensagemOperacional } = require("../services/nexaRouterService")
const {
  detectarPedidoMemoria,
  registrarMemoria,
  esquecerMemoria,
  obterMemoriasRelevantes,
} = require("../services/memoriaEvolutivaService")
const {
  aplicarVocabulario,
  aprenderTermo: aprenderTermoVoz,
  detectarInstrucaoDeAprendizado,
} = require("../services/vocabularioVozService")
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
const NEXA_CONVERSACIONAL_V2_ATIVA = String(process.env.NEXA_CONVERSACIONAL_V2 || "true").toLowerCase() !== "false"
const NEXA_MODEL_ROUTER_ATIVO = String(process.env.NEXA_MODEL_ROUTER || "true").toLowerCase() !== "false"


const PAGINAS_NAVEGACAO = [
  { pagina: "Dashboard", aliases: ["dashboard", "dash board", "dasboard", "painel inicial", "tela inicial", "pagina inicial", "inicio", "home"] },
  { pagina: "Escritório Digital", aliases: ["escritorio digital"] },
  { pagina: "Clientes", aliases: ["servicos e cobrancas", "servico e cobranca", "servicos avulsos", "servico avulso", "lancamento de servico avulso", "lancar servico avulso", "cadastro de clientes", "carteira de clientes", "lista de clientes", "clientes", "cliente"] },
  { pagina: "Serviços", aliases: ["servicos"] },
  { pagina: "Plano de Contas", aliases: ["plano de contas"] },
  { pagina: "Lançamentos Contábeis", aliases: ["lancamentos contabeis", "lancamento contabil", "lancamentos", "contabil", "contabeis", "contabilidade", "area contabil", "modulo contabil", "tela contabil", "parte contabil"] },
  { pagina: "Movimentos Clientes", aliases: ["movimentacao desta mesma empresa", "movimentacao desta empresa", "movimentacao da mesma empresa", "movimentacao da empresa", "movimentacao deste cliente", "movimentacao desse cliente", "movimentacao do cliente", "movimentacao dela", "movimentacao dele", "movimentacoes desta empresa", "movimentacoes da empresa", "movimentacoes do cliente", "movimentacoes dos clientes", "movimentacoes clientes", "movimento desta mesma empresa", "movimento desta empresa", "movimento da mesma empresa", "movimento da empresa", "movimento deste cliente", "movimento desse cliente", "movimento do cliente", "movimento dela", "movimento dele", "movimentos desta empresa", "movimentos da empresa", "movimentos do cliente", "movimentos dos clientes", "movimentos clientes", "movimentacao", "movimentacoes", "movimento", "movimentos"] },
  { pagina: "Pendências Clientes", aliases: ["pendencias dos clientes", "pendencias clientes", "pendencias"] },
  { pagina: "Acesso Rápido Fiscal", aliases: ["acesso rapido fiscal", "atalhos fiscais"] },
  { pagina: "Documentos Digitais", aliases: ["documentos digitais", "documentos", "arquivos"] },
  { pagina: "WhatsApp Inteligente", aliases: ["whatsapp inteligente", "whatsapp"] },
  { pagina: "Assistente do Dia", aliases: ["assistente do dia", "prioridades do dia", "iniciar meu dia", "iniciar o dia", "começar o dia", "comecar o dia", "comecar meu dia", "começar meu dia"] },
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
  { pagina: "Fiscal", aliases: ["modulo fiscal", "tela fiscal", "area fiscal", "parte fiscal", "fiscal"] },
  { pagina: "Financeiro", aliases: ["meu financeiro", "financeiro do escritorio", "modulo financeiro", "tela financeira", "financeiro"] },
  { pagina: "Relatórios", aliases: ["relatorios"] },
  { pagina: "Usuários", aliases: ["usuarios"] },
  { pagina: "Notificações", aliases: ["notificacoes"] },
  { pagina: "Agenda", aliases: ["agenda"] },
  { pagina: "Backup Sistema", aliases: ["backup do sistema", "backup sistema", "backup"] },
  { pagina: "Sobre", aliases: ["sobre a nexa", "sobre"] },
  { pagina: "Calculadora IRPF MEI", aliases: ["calculadora irpf mei", "calculadora irpf"] },
  { pagina: "DRE Gerencial", aliases: ["dre gerencial", "dre da empresa", "dre do cliente", "demonstracao do resultado", "demonstracao de resultado", "dre"] },
]

const GRUPOS_NAVEGACAO = [
  { grupo: "Contábil", aliases: ["contabil", "area contabil", "menu contabil"] },
  { grupo: "Fiscal", aliases: ["menu fiscal", "grupo fiscal"] },
  { grupo: "Financeiro", aliases: ["menu financeiro", "grupo financeiro"] },
  { grupo: "Atendimento", aliases: ["atendimento", "menu atendimento", "grupo atendimento"] },
  { grupo: "Ferramentas", aliases: ["ferramentas", "menu ferramentas", "grupo ferramentas"] },
  { grupo: "Configurações", aliases: ["configuracoes", "menu configuracoes", "grupo configuracoes"] },
]

const DESCRICOES_PAGINAS_NAVEGACAO = {
  Dashboard: "visão geral, prioridades e indicadores do escritório",
  Notificações: "central de notificações e interações recentes",
  "Escritório Digital": "atalhos e serviços digitais do escritório",
  Clientes: "lista, cadastro e Central individual de cada cliente",
  Serviços: "cadastro e controle de serviços",
  "Plano de Contas": "plano contábil",
  "Lançamentos Contábeis": "lançamentos, contabilidade e escrituração",
  "Movimentos Clientes": "movimentações financeiras e operacionais dos clientes",
  "DRE Gerencial": "demonstrativo de resultados",
  Fiscal: "obrigações e rotinas fiscais",
  Financeiro: "financeiro do escritório",
  "Pendências Clientes": "pendências e guias dos clientes",
  "Acesso Rápido Fiscal": "atalhos fiscais",
  "Documentos Digitais": "documentos e arquivos dos clientes",
  "WhatsApp Inteligente": "mensagens e atendimento por WhatsApp",
  "Assistente do Dia": "prioridades e rotina diária",
  "Laboratório Tributário": "simulações e análises tributárias",
  "Certificados Digitais": "certificados digitais A1",
  "Procurações e-CAC": "procurações eletrônicas",
  "Identidade Digital": "identidade e acessos digitais",
  "Central e-CAC": "atalhos e histórico do e-CAC",
  "Memória da Nexa": "memórias registradas pela assistente",
  "Segundo Contador": "análise e apoio contábil inteligente",
  "Consultora Tributária": "consultoria tributária",
  "Conversa com a Nexa": "chat geral com a Nexa",
  "Radar Inteligente": "riscos, alertas e oportunidades",
  Relatórios: "relatórios do escritório",
  Usuários: "usuários e permissões",
  Agenda: "agenda e compromissos",
  "Backup Sistema": "backup do sistema",
  Sobre: "versão e informações da Nexa",
  "Calculadora IRPF MEI": "calculadora de IRPF e MEI",
}

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
  "Lançamentos Contábeis",
  "DRE Gerencial",
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

function pedidoResumoOperacionalDoDia(valor) {
  const texto = normalizar(valor)
  if (!texto) return false

  const abriuRelatoriosExplicitamente = /(^|\s)(abra|abre|abrir|acesse|acessar|entre|entrar|va para|vai para|me leve para|navegue para)\s+(?:a\s+)?(?:pagina|tela|area|secao|modulo)?\s*(?:de\s+)?relatorios?\b/.test(texto)
  if (abriuRelatoriosExplicitamente) return false

  return /(?:^|\s)(?:me (?:de|dê|passe|mostre|fale)|faca|faça|quero|preciso de)?\s*(?:um\s+)?(?:relatorio|resumo|panorama)\s+(?:operacional\s+)?(?:de|do|para|pra)\s+(?:hoje|dia)\b/.test(texto)
    || /(?:^|\s)(?:relatorio|resumo)\s+de\s+hoje\b/.test(texto)
    || /(?:^|\s)o que (?:eu )?(?:tenho|preciso) (?:para )?(?:fazer|resolver) hoje\b/.test(texto)
}

function mensagemOperacionalDeterministica(valor) {
  const texto = normalizar(valor).replace(/[.!?,;:]+$/g, "").trim()
  if (!texto) return false
  if (pedidoResumoOperacionalDoDia(texto)) return true
  return /(iniciar (?:o|meu) dia|quais(?: sao)?(?: todas)?(?: as)? pendencias|todas(?: as)? pendencias|qual(?: e)?(?: a)? prioridade|prioridades? (?:de|do|para) hoje|quem pagou(?: hoje)?|pagamentos? recebidos?(?: hoje)?|pendencias? resolvidas?(?: hoje)?|mensagens? (?:pendentes?|de clientes?)|pedidos? de ajuda|documentos? (?:recebidos?|pendentes?|aguardando analise)|quem esta devendo|quem deve para o escritorio|quanto entrou hoje)/.test(texto)
}

function corrigirTranscricaoPeloContexto({ mensagem, historico = [], origem = "texto" }) {
  const textoOriginal = String(mensagem || "").trim()
  if (!textoOriginal || normalizar(origem) !== "voz") {
    return { texto: textoOriginal, alterada: false, substituicoes: [] }
  }

  const contextoRecente = limparHistorico(historico)
    .slice(-8)
    .map((item) => normalizar(item.texto))
    .join(" ")
  const atual = normalizar(textoOriginal)
  const assuntoContador = /(contador|contadora|contabilidade|profissao contabil|mei)/.test(contextoRecente)
  const continuacaoSobreEmpresa = /(tipo de empresa|empresa.*abrir|pode abrir|qual empresa|natureza juridica)/.test(atual)

  if (assuntoContador && continuacaoSobreEmpresa && /\bcomputador(?:a|es)?\b/i.test(textoOriginal)) {
    const corrigido = textoOriginal.replace(/\bcomputador(?:a|es)?\b/gi, (termo) => {
      if (/a$/i.test(termo)) return "contadora"
      return "contador"
    })
    return {
      texto: corrigido,
      alterada: corrigido !== textoOriginal,
      substituicoes: [{ termoOuvido: "computador", termoCorreto: "contador", origem: "contexto" }],
    }
  }

  return { texto: textoOriginal, alterada: false, substituicoes: [] }
}

function distanciaLevenshtein(a, b) {
  const origem = normalizar(a)
  const destino = normalizar(b)
  if (!origem) return destino.length
  if (!destino) return origem.length

  const linha = Array.from({ length: destino.length + 1 }, (_, indice) => indice)
  for (let i = 1; i <= origem.length; i += 1) {
    let diagonal = linha[0]
    linha[0] = i
    for (let j = 1; j <= destino.length; j += 1) {
      const anterior = linha[j]
      const custo = origem[i - 1] === destino[j - 1] ? 0 : 1
      linha[j] = Math.min(
        linha[j] + 1,
        linha[j - 1] + 1,
        diagonal + custo,
      )
      diagonal = anterior
    }
  }
  return linha[destino.length]
}

function similaridade(a, b) {
  const origem = normalizar(a)
  const destino = normalizar(b)
  const maior = Math.max(origem.length, destino.length)
  if (!maior) return 1
  return 1 - (distanciaLevenshtein(origem, destino) / maior)
}

function extrairNomeFaladoDaMensagem(texto) {
  const limpo = normalizar(texto)
    .replace(/\b(?:por favor|para mim|pra mim|agora)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const padroes = [
    /(?:cliente|empresa)\s+(.+?)$/,
    /(?:fiscal|movimentacao|movimentacoes|movimento|movimentos|documentos|pendencias|contabil|contabilidade|lancamento|lancamentos|dre)\s+(?:da|do|de)\s+(.+?)$/,
  ]

  for (const padrao of padroes) {
    const correspondencia = limpo.match(padrao)
    if (!correspondencia) continue
    const candidato = String(correspondencia[1] || "")
      .replace(/\b(?:abra|abre|abrir|acesse|entre|vai|va)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (candidato.length >= 3 && candidato.split(" ").length <= 8) return candidato
  }

  return ""
}

function sugerirClientePorSom(clientes, nomeFalado) {
  const falado = normalizar(nomeFalado)
  if (!falado || falado.length < 3) return null

  const candidatos = clientes.map((cliente) => {
    const nomeCompleto = normalizar(nomeCliente(cliente))
    const tokens = nomeCompleto
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !PALAVRAS_IGNORADAS_CLIENTE.has(token))
    const opcoes = [nomeCompleto, ...tokens]
    let melhor = 0
    for (const opcao of opcoes) {
      melhor = Math.max(melhor, similaridade(falado, opcao))
      if (falado.includes(opcao) || opcao.includes(falado)) melhor = Math.max(melhor, 0.86)
    }
    return { cliente, pontos: melhor }
  }).sort((a, b) => b.pontos - a.pontos)

  const melhor = candidatos[0]
  const segundo = candidatos[1]
  if (!melhor || melhor.pontos < 0.68) return null
  if (segundo && melhor.pontos - segundo.pontos < 0.07) return null
  return melhor.cliente
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

  const encontrados = candidatos.filter((item) => texto.includes(item.alias))
  const paginaEspecifica = encontrados.find(
    (item) => !(item.pagina === "Clientes" && ["cliente", "clientes"].includes(item.alias)),
  )
  return paginaEspecifica || encontrados[0] || null
}

function configuracaoGrupoNoTexto(texto) {
  const candidatos = GRUPOS_NAVEGACAO
    .flatMap((item) => item.aliases.map((alias) => ({ ...item, alias: normalizar(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length)
  return candidatos.find((item) => texto === item.alias || texto.includes(item.alias)) || null
}

function temVerboNavegacao(texto) {
  return /(^|\s)(abra|abre|abri|abrir|acessa|acesse|acessar|entra|entre|entrar|vai|va|ir|navega|navegue|navegar|mostra|mostre|mostrar|exiba|exibir|volta|volte|voltar|voltando|volto|retorna|retorne|retornar|quero|quero ir|quero ver|quero abrir|quero acessar|quero entrar|ver|me leva|me leve|direciona|direcione)(\s|$)/.test(texto)
}

function pareceComandoNavegacao(texto) {
  const paginaEncontrada = configuracaoPaginaNoTexto(texto)
  if (!paginaEncontrada) return false

  // Frases curtas ditadas por voz costumam chegar com ponto ou interrogação no fim.
  // Sem limpar essa pontuação, “Serviços e cobranças.” deixava de ser reconhecido
  // como destino exato e podia cair na página geral de Serviços.
  const textoSemPontuacaoFinal = String(texto || "").replace(/[.!?,;:]+$/g, "").trim()
  if (paginaEncontrada.alias === textoSemPontuacaoFinal) return true
  if (/^(agora|depois|em seguida)\b/.test(textoSemPontuacaoFinal)) return true

  return temVerboNavegacao(textoSemPontuacaoFinal)
}

function perguntaLivreSemDestinoDeTela(texto) {
  if (pedidoResumoOperacionalDoDia(texto)) return true
  if (configuracaoPaginaNoTexto(texto) || configuracaoGrupoNoTexto(texto)) return false
  return /^(por que|porque|qual|quais|como|o que|oque|quem|quando|quanto|quantos|quantas|posso|pode|devo|preciso|sera que)\b/.test(texto)
}

function pontuarClienteNoTexto(cliente, texto) {
  const nome = normalizar(nomeCliente(cliente))
  if (!nome) return 0
  if (texto.includes(nome)) return 1000 + nome.length

  const tokens = [...new Set(nome.split(/\s+/).filter((token) => token.length >= 3 && !PALAVRAS_IGNORADAS_CLIENTE.has(token)))]
  return tokens.reduce((pontos, token) => pontos + (contemPalavra(texto, token) ? token.length : 0), 0)
}

function formatarCodigoCliente(clienteOuId) {
  const id = typeof clienteOuId === "object" ? clienteOuId?.id : clienteOuId
  const numero = Number(id)
  if (!Number.isInteger(numero) || numero <= 0) return ""
  return `CLI-${String(numero).padStart(4, "0")}`
}

function localizarClientePorCodigo(clientes, texto) {
  const valor = normalizar(texto)
  const padroes = [
    /\bcli\s*[-#]?\s*0*(\d+)\b/,
    /\b(?:codigo|id)\s+(?:do\s+)?(?:cliente\s+)?#?\s*0*(\d+)\b/,
    /\bcliente\s+(?:numero\s+|n[ºo°]\s*)?#?\s*0*(\d+)\b/,
  ]

  for (const padrao of padroes) {
    const correspondencia = valor.match(padrao)
    if (!correspondencia) continue
    const id = Number(correspondencia[1])
    const cliente = clientes.find((item) => Number(item.id) === id)
    if (cliente) return cliente
  }

  return null
}

function localizarClienteNoTexto(clientes, texto) {
  const textoNormalizado = normalizar(texto)
  const porCodigo = localizarClientePorCodigo(clientes, textoNormalizado)
  if (porCodigo) return { cliente: porCodigo, ambiguo: false, candidatos: [porCodigo] }

  const pontuados = clientes
    .map((cliente) => ({ cliente, pontos: pontuarClienteNoTexto(cliente, textoNormalizado) }))
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)

  if (!pontuados.length) return { cliente: null, ambiguo: false, candidatos: [] }

  const melhorPontuacao = pontuados[0].pontos
  const melhores = pontuados.filter((item) => item.pontos === melhorPontuacao)
  if (melhores.length > 1) {
    return {
      cliente: null,
      ambiguo: true,
      candidatos: melhores.map((item) => item.cliente).slice(0, 8),
    }
  }

  return { cliente: pontuados[0].cliente, ambiguo: false, candidatos: [pontuados[0].cliente] }
}

function usuarioPodeAbrirPagina(usuario, pagina) {
  const perfil = usuario?.perfil || ""
  return Boolean(PAGINAS_POR_PERFIL[perfil]?.has(pagina))
}

function respostaDeComando({ resposta, acao = null, ...extras }) {
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
    ...extras,
  }
}

function respostaNaturalDeNavegacao({ pagina, alvo, clienteAcao, clienteAtual }) {
  const clienteMudou = Boolean(
    clienteAcao
    && (!clienteAtual || String(clienteAcao.id) !== String(clienteAtual.id)),
  )

  if (alvo === "central-cliente") {
    const texto = clienteMudou
      ? `Cliente ${nomeCliente(clienteAcao)} aberto.`
      : "Cliente aberto."
    return {
      resposta: texto,
      fala: clienteAcao ? `Certo, abri ${nomeCliente(clienteAcao)}.` : "Cliente aberto.",
    }
  }

  const porPagina = {
    Dashboard: { resposta: "Dashboard aberto.", fala: "Pronto." },
    Clientes: { resposta: "Clientes abertos.", fala: "Certo." },
    Fiscal: { resposta: "Fiscal aberto.", fala: "Pronto." },
    "Movimentos Clientes": { resposta: "Movimentações abertas.", fala: "Aqui está." },
    "Lançamentos Contábeis": { resposta: "Lançamentos contábeis abertos.", fala: "Certo." },
    "DRE Gerencial": { resposta: "DRE aberta.", fala: "Aqui está." },
    Financeiro: { resposta: "Financeiro aberto.", fala: "Pronto." },
    "Documentos Digitais": { resposta: "Documentos abertos.", fala: "Aqui está." },
    "Pendências Clientes": { resposta: "Pendências abertas.", fala: "Certo." },
  }

  const natural = porPagina[pagina] || {
    resposta: "Tela aberta.",
    fala: "Pronto.",
  }

  if (clienteMudou && clienteAcao && PAGINAS_COM_FILTRO_CLIENTE.has(pagina)) {
    const texto = `${natural.resposta.replace(/\.$/, "")} para ${nomeCliente(clienteAcao)}.`
    return {
      resposta: texto,
      fala: `Certo, abri ${pagina} para ${nomeCliente(clienteAcao)}.`,
    }
  }

  return natural
}

async function detectarComandoNavegacaoDeterministico({ mensagem, clienteId, usuario, origem = "texto" }) {
  const texto = normalizar(mensagem)
  if (!texto) return null

  const paginaEncontradaInicial = configuracaoPaginaNoTexto(texto)
  const grupoEncontrado = configuracaoGrupoNoTexto(texto)
  const temVerbo = temVerboNavegacao(texto)
  const pareceNavegacao = pareceComandoNavegacao(texto)

  if (grupoEncontrado && (texto === grupoEncontrado.alias || temVerbo) && (!paginaEncontradaInicial || /\b(menu|grupo)\b/.test(texto))) {
    return respostaDeComando({
      resposta: `Menu ${grupoEncontrado.grupo} aberto.`,
      fala: `Certo, menu ${grupoEncontrado.grupo} aberto.`,
      acao: { tipo: "abrir-grupo", grupo: grupoEncontrado.grupo, segura: true },
    })
  }

  if (paginaEncontradaInicial && !pareceNavegacao) return null

  if (paginaEncontradaInicial
    && paginaEncontradaInicial.pagina !== "Clientes"
    && !PAGINAS_COM_FILTRO_CLIENTE.has(paginaEncontradaInicial.pagina)) {
    if (!usuarioPodeAbrirPagina(usuario, paginaEncontradaInicial.pagina)) {
      return respostaDeComando({ resposta: `Seu perfil não possui permissão para abrir ${paginaEncontradaInicial.pagina}.` })
    }
    const natural = respostaNaturalDeNavegacao({
      pagina: paginaEncontradaInicial.pagina,
      alvo: "pagina",
      clienteAcao: null,
      clienteAtual: null,
    })
    return respostaDeComando({
      resposta: natural.resposta,
      fala: natural.fala,
      acao: { tipo: "navegar", pagina: paginaEncontradaInicial.pagina, alvo: "pagina", segura: true, cliente: null },
    })
  }

  // Comandos como “abrir Multicópias Maracanã” não citam a palavra
  // “cliente”, mas devem abrir diretamente a Central desse cliente.
  // Antes, o roteador exigia o nome de uma página e a IA apenas respondia
  // que havia aberto, sem entregar uma ação executável para a Web.
  if (!paginaEncontradaInicial && !temVerbo) return null

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
  const nomeFalado = !localizado.cliente ? extrairNomeFaladoDaMensagem(texto) : ""
  const clienteSugerido = nomeFalado ? sugerirClientePorSom(clientes, nomeFalado) : null

  if (!localizado.cliente && !localizado.ambiguo && clienteSugerido) {
    if (normalizar(origem) === "voz") {
      localizado.cliente = clienteSugerido
    } else {
      const nomeCorreto = nomeCliente(clienteSugerido)
      const regexNome = new RegExp(escaparRegex(nomeFalado), "i")
      const comandoCorrigido = String(mensagem || "").replace(regexNome, nomeCorreto)
      return respostaDeComando({
        resposta: `Você quis dizer ${nomeCorreto}?`,
        vocabularioSugestao: {
          termoOuvido: nomeFalado,
          termoCorreto: nomeCorreto,
          clienteId: clienteSugerido.id,
          comandoCorrigido,
        },
      })
    }
  }

  if (localizado.ambiguo) {
    const paginaAmbigua = paginaEncontradaInicial?.pagina || "Clientes"
    const ehServicosCobrancas = /(servicos? e cobrancas?|servicos? avulsos?|lancamento de servico avulso|lancar servico avulso)/.test(texto)
    const alvoAmbiguo = paginaAmbigua === "Clientes" ? "central-cliente" : "pagina"
    const candidatos = (localizado.candidatos || []).map((cliente) => ({
      id: cliente.id,
      nome: nomeCliente(cliente),
      codigo: formatarCodigoCliente(cliente),
    }))
    const opcoes = candidatos
      .slice(0, 4)
      .map((cliente) => `${cliente.codigo}, ${cliente.nome}`)
      .join("; ")
    const resposta = `Encontrei mais de um cliente compatível: ${opcoes}. Diga o código do cliente correto.`

    return respostaDeComando({
      resposta,
      fala: resposta,
      selecaoClientePendente: {
        pagina: paginaAmbigua,
        alvo: alvoAmbiguo,
        secao: ehServicosCobrancas ? "servicos" : "",
        candidatos,
      },
    })
  }

  const referenciaContextual = /(esse cliente|este cliente|o mesmo cliente|do mesmo cliente|desse cliente|deste cliente|cliente selecionado|essa empresa|esta empresa|a mesma empresa|da mesma empresa|dessa empresa|desta empresa|desta mesma empresa|dela|dele)/.test(texto)
  const clienteReferencia = localizado.cliente || (referenciaContextual ? clienteAtual : null)
  const querCentralCliente = /(central.*cliente|cliente.*central|cadastro.*cliente|dados.*cliente)/.test(texto)
  const mencionaClienteSingular = contemPalavra(texto, "cliente")

  const paginaEncontrada = paginaEncontradaInicial
  const ehServicosCobrancas = /(servicos? e cobrancas?|servicos? avulsos?|lancamento de servico avulso|lancar servico avulso)/.test(texto)
  let pagina = paginaEncontrada?.pagina || null
  let alvo = "pagina"
  let secao = ""

  if (ehServicosCobrancas) {
    pagina = "Clientes"
    alvo = "central-cliente"
    secao = "servicos"
  } else if (querCentralCliente || (!pagina && localizado.cliente && temVerbo)) {
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
    secao,
    segura: true,
    cliente: clienteAcao
      ? { id: clienteAcao.id, nome: nomeCliente(clienteAcao) }
      : null,
  }

  const natural = respostaNaturalDeNavegacao({
    pagina,
    alvo,
    clienteAcao,
    clienteAtual,
  })

  return respostaDeComando({
    resposta: natural.resposta,
    fala: natural.fala,
    acao,
  })
}

async function resolverSelecaoClientePendente({ selecao, clienteSelecionadoId, cancelar, clienteIdAtual, usuario }) {
  if (!selecao || typeof selecao !== "object") return null

  const pagina = normalizarNomeCanonico(
    selecao.pagina,
    PAGINAS_NAVEGACAO.map((item) => item.pagina),
  )
  const alvo = normalizar(selecao.alvo) === "central-cliente" ? "central-cliente" : "pagina"
  const secao = normalizar(selecao.secao) === "servicos" ? "servicos" : ""
  const idsPermitidos = new Set(
    (Array.isArray(selecao.candidatos) ? selecao.candidatos : [])
      .map((item) => Number(item?.id))
      .filter((id) => Number.isInteger(id) && id > 0),
  )

  if (!pagina || !idsPermitidos.size) return null

  if (cancelar) {
    return respostaDeComando({
      resposta: "Seleção de cliente cancelada.",
      fala: "Certo, cancelei.",
      selecaoClienteCancelada: true,
    })
  }

  if (!usuarioPodeAbrirPagina(usuario, pagina)) {
    return respostaDeComando({
      resposta: `Seu perfil não possui permissão para abrir ${pagina}.`,
      selecaoClienteCancelada: true,
    })
  }

  const candidatos = await Cliente.findAll({
    where: { id: [...idsPermitidos] },
    attributes: ["id", "nome", "regime", "situacaoEmpresa"],
    order: [["nome", "ASC"]],
  })

  const candidatosPermitidos = usuario?.perfil === "Cliente" && usuario?.clienteVinculado
    ? candidatos.filter((cliente) => normalizar(nomeCliente(cliente)) === normalizar(usuario.clienteVinculado))
    : candidatos

  const idSelecionado = Number(clienteSelecionadoId)
  const clienteAcao = candidatosPermitidos.find((cliente) => Number(cliente.id) === idSelecionado) || null

  if (!clienteAcao) {
    const opcoes = candidatosPermitidos
      .slice(0, 4)
      .map((cliente) => `${formatarCodigoCliente(cliente)}, ${nomeCliente(cliente)}`)
      .join("; ")
    const resposta = `Não identifiquei o código. As opções são: ${opcoes}. Diga somente o código do cliente.`
    return respostaDeComando({
      resposta,
      fala: resposta,
      selecaoClientePendente: {
        pagina,
        alvo,
        secao,
        candidatos: candidatosPermitidos.map((cliente) => ({
          id: cliente.id,
          nome: nomeCliente(cliente),
          codigo: formatarCodigoCliente(cliente),
        })),
      },
    })
  }

  const clienteAtual = clienteIdAtual
    ? await Cliente.findByPk(clienteIdAtual, { attributes: ["id", "nome"] })
    : null
  const acao = {
    tipo: "navegar",
    pagina,
    alvo,
    secao,
    segura: true,
    cliente: { id: clienteAcao.id, nome: nomeCliente(clienteAcao) },
  }
  const natural = respostaNaturalDeNavegacao({ pagina, alvo, clienteAcao, clienteAtual })
  const codigo = formatarCodigoCliente(clienteAcao)

  return respostaDeComando({
    resposta: `${natural.resposta.replace(/\.$/, "")} — ${codigo}.`,
    fala: natural.fala,
    acao,
    selecaoClienteConcluida: true,
  })
}

function normalizarNomeCanonico(valor, opcoes) {
  const alvo = normalizar(valor)
  if (!alvo) return ""
  return opcoes.find((item) => normalizar(item) === alvo) || ""
}

function extrairObjetoJsonLivre(texto) {
  const limpo = String(texto || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim()
  const inicio = limpo.indexOf("{")
  const fim = limpo.lastIndexOf("}")
  if (inicio < 0 || fim <= inicio) return null
  try {
    return JSON.parse(limpo.slice(inicio, fim + 1))
  } catch {
    return null
  }
}

function resolverClienteDaInterpretacao(clientes, resultado, clienteAtual) {
  const idInformado = resultado?.clienteId
  if (idInformado !== null && idInformado !== undefined && idInformado !== "") {
    const porId = clientes.find((cliente) => String(cliente.id) === String(idInformado))
    if (porId) return porId
  }

  const nomeInformado = normalizar(resultado?.clienteNome)
  if (nomeInformado) {
    const localizado = localizarClienteNoTexto(clientes, nomeInformado)
    if (localizado.cliente && !localizado.ambiguo) return localizado.cliente
    const sugerido = sugerirClientePorSom(clientes, nomeInformado)
    if (sugerido) return sugerido
  }

  if (resultado?.usarClienteAtual && clienteAtual) return clienteAtual
  return null
}

async function detectarComandoNavegacaoSemantico({ mensagem, clienteId, usuario, paginaAtual = "", historico = [] }) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  let clientes = await Cliente.findAll({
    attributes: ["id", "nome", "regime", "situacaoEmpresa"],
    order: [["nome", "ASC"]],
    limit: 180,
  })

  if (usuario?.perfil === "Cliente" && usuario?.clienteVinculado) {
    clientes = clientes.filter((cliente) => normalizar(nomeCliente(cliente)) === normalizar(usuario.clienteVinculado))
  }

  const clienteAtual = clienteId
    ? clientes.find((cliente) => String(cliente.id) === String(clienteId)) || null
    : null
  const paginasPermitidas = PAGINAS_NAVEGACAO
    .map((item) => item.pagina)
    .filter((pagina, indice, lista) => lista.indexOf(pagina) === indice)
    .filter((pagina) => usuarioPodeAbrirPagina(usuario, pagina))
  const gruposPermitidos = usuario?.perfil === "Cliente" ? [] : GRUPOS_NAVEGACAO.map((item) => item.grupo)

  const catalogoPaginas = paginasPermitidas.map((pagina) => ({
    pagina,
    finalidade: DESCRICOES_PAGINAS_NAVEGACAO[pagina] || pagina,
    aceitaCliente: PAGINAS_COM_FILTRO_CLIENTE.has(pagina) || pagina === "Clientes",
  }))
  const catalogoClientes = clientes.map((cliente) => ({ id: cliente.id, nome: nomeCliente(cliente) }))

  const prompt = `Você é o roteador de navegação da Nexa ERP. Interprete português brasileiro natural, inclusive frases incompletas, sinônimos, pronomes e continuação de contexto.
Seu trabalho é decidir se o usuário quer NAVEGAR no sistema, ABRIR um grupo do menu ou apenas CONVERSAR.
Nunca invente páginas ou clientes. Use somente os nomes canônicos fornecidos.

REGRAS IMPORTANTES:
- "abra o fiscal Multicópias" => navegar para "Fiscal" com o cliente Multicópias.
- "agora vá para o cliente Maurício" => abrir a Central desse cliente: página "Clientes", alvo "central-cliente".
- "serviços e cobranças" depois de abrir um cliente => página "Clientes", alvo "central-cliente", seção "servicos" e usar o cliente atual.
- "abra serviços e cobranças do Matheus" => página "Clientes", alvo "central-cliente", seção "servicos" com Matheus.
- Nunca envie “serviços e cobranças” para a página geral "Serviços".
- "quero ver a movimentação do Maurício" => página "Movimentos Clientes" com Maurício.
- "entre em ferramentas" => abrir o grupo "Ferramentas".
- "abra o dashboard" => página "Dashboard".
- "faça um relatório para hoje", "resumo do dia" e "o que tenho para fazer hoje" são CONSULTAS OPERACIONAIS, portanto classifique como conversar. Não abra Relatórios.
- Só navegue para "Relatórios" quando houver pedido explícito de abrir/acessar a página, tela, área ou módulo de relatórios.
- "como está a Multicópias?" é conversa, não navegação.
- Quando disser "dele", "dela", "desse cliente", "agora no fiscal" ou algo equivalente, use o cliente atual se existir.
- Se o pedido for claramente de navegação, não faça pergunta desnecessária. Só marque ambíguo quando houver realmente dois clientes possíveis ou faltar um cliente indispensável.

PÁGINA ATUAL: ${paginaAtual || "não informada"}
CLIENTE ATUAL: ${clienteAtual ? `${clienteAtual.id} - ${nomeCliente(clienteAtual)}` : "nenhum"}
HISTÓRICO RECENTE: ${JSON.stringify(limparHistorico(historico).slice(-8))}
PÁGINAS DISPONÍVEIS: ${JSON.stringify(catalogoPaginas)}
GRUPOS DISPONÍVEIS: ${JSON.stringify(gruposPermitidos)}
CLIENTES CADASTRADOS: ${JSON.stringify(catalogoClientes)}

FRASE DO USUÁRIO: ${String(mensagem || "").slice(0, 500)}

Retorne SOMENTE JSON válido, sem markdown:
{"intencao":"navegar|abrir-grupo|conversar|ambiguo","pagina":"nome canônico ou vazio","grupo":"nome canônico ou vazio","alvo":"pagina|central-cliente","secao":"servicos ou vazio","clienteId":null,"clienteNome":"","usarClienteAtual":false,"resposta":""}`

  const controlador = new AbortController()
  const timeout = setTimeout(() => controlador.abort(), 14000)

  try {
    const resposta = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controlador.signal,
      body: JSON.stringify({
        model: MODELO_PADRAO,
        messages: [
          { role: "system", content: "Classifique comandos de navegação da Nexa ERP e devolva somente JSON válido." },
          { role: "user", content: prompt },
        ],
        max_tokens: 180,
        temperature: 0,
      }),
    })

    if (!resposta.ok) return null
    const dados = await resposta.json().catch(() => ({}))
    const interpretado = extrairObjetoJsonLivre(extrairTextoGroq(dados))
    if (!interpretado) return null

    const intencao = normalizar(interpretado.intencao).replace(/\s+/g, "-")
    if (intencao === "conversar" || intencao === "conversa") return null

    if (intencao === "ambiguo") {
      const textoResposta = String(interpretado.resposta || "Preciso que você informe a tela ou o cliente com mais clareza.").trim()
      return respostaDeComando({
        resposta: textoResposta,
        fala: textoResposta,
      })
    }

    if (intencao === "abrir-grupo") {
      const grupo = normalizarNomeCanonico(interpretado.grupo, gruposPermitidos)
      if (!grupo) return null
      return respostaDeComando({
        resposta: `Menu ${grupo} aberto.`,
        fala: `Certo, menu ${grupo} aberto.`,
        acao: { tipo: "abrir-grupo", grupo, segura: true },
      })
    }

    if (intencao !== "navegar") return null

    const pedidoServicosCobrancas = /(servicos? e cobrancas?|servicos? avulsos?|lancamento de servico avulso|lancar servico avulso)/.test(normalizar(mensagem))
    let pagina = normalizarNomeCanonico(interpretado.pagina, paginasPermitidas)
    if (pedidoServicosCobrancas) pagina = "Clientes"
    if (!pagina) return null

    const interpretacaoCliente = pedidoServicosCobrancas && !interpretado.clienteId && !interpretado.clienteNome
      ? { ...interpretado, usarClienteAtual: true }
      : interpretado
    const clienteAcao = resolverClienteDaInterpretacao(clientes, interpretacaoCliente, clienteAtual)
    let alvo = normalizar(interpretado.alvo) === "central-cliente" ? "central-cliente" : "pagina"
    let secao = normalizar(interpretado.secao) === "servicos" ? "servicos" : ""

    if (pedidoServicosCobrancas) {
      alvo = "central-cliente"
      secao = "servicos"
    } else if (pagina === "Clientes" && clienteAcao && (alvo === "central-cliente" || interpretado.clienteId || interpretado.clienteNome)) {
      alvo = "central-cliente"
    }

    if (alvo === "central-cliente" && !clienteAcao) {
      return respostaDeComando({
        resposta: "Qual cliente você quer abrir?",
        fala: "Qual cliente você quer abrir?",
      })
    }

    const acao = {
      tipo: "navegar",
      pagina,
      alvo,
      secao,
      segura: true,
      cliente: clienteAcao ? { id: clienteAcao.id, nome: nomeCliente(clienteAcao) } : null,
    }
    const natural = respostaNaturalDeNavegacao({ pagina, alvo, clienteAcao, clienteAtual })
    return respostaDeComando({ resposta: natural.resposta, fala: natural.fala, acao })
  } catch (error) {
    console.warn("NAVEGAÇÃO SEMÂNTICA DA NEXA INDISPONÍVEL:", error?.message || error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function detectarComandoNavegacao(parametros) {
  if (pedidoResumoOperacionalDoDia(parametros?.mensagem)) return null
  const deterministico = await detectarComandoNavegacaoDeterministico(parametros)
  if (deterministico) return deterministico

  const texto = normalizar(parametros?.mensagem)
  if (perguntaLivreSemDestinoDeTela(texto)) return null
  return detectarComandoNavegacaoSemantico(parametros)
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

function numeroMoedaSeguro(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0
  let texto = String(valor ?? "").replace(/R\$/gi, "").replace(/\s/g, "")
  if (!texto) return 0
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".")
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function formatarMoedaBrasil(valor) {
  return numeroMoedaSeguro(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function resumirServicoCobranca(item) {
  const valorTotal = numeroMoedaSeguro(item.valorTotal)
  const dias = diasAte(item.vencimento)
  const status = item.status || "Pendente"
  const statusNormalizado = normalizar(status)
  const emAtraso = !["recebido", "cancelado"].includes(statusNormalizado) && dias !== null && dias < 0

  return {
    id: item.id,
    clienteId: item.clienteId,
    cliente: item.cliente,
    descricao: item.descricao,
    quantidade: Number(item.quantidade || 1),
    valorUnitario: formatarMoedaBrasil(item.valorUnitario),
    desconto: formatarMoedaBrasil(item.desconto),
    valorTotal: formatarMoedaBrasil(valorTotal),
    valorTotalNumero: valorTotal,
    data: item.data,
    vencimento: item.vencimento,
    dataRecebimento: item.dataRecebimento,
    status: emAtraso ? "Em atraso" : status,
    diasAteVencimento: dias,
    formaPagamento: item.formaPagamento || null,
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
  const [fiscais, financeiros, documentos, certificados, procuracoes, servicosCobrancas] = await Promise.all([
    Fiscal.findAll({ where: { cliente: nome }, order: [["createdAt", "DESC"]], limit: 120 }),
    Financeiro.findAll({ where: { cliente: nome, [Op.or]: [{ origem: { [Op.ne]: "Serviço Avulso" } }, { origem: { [Op.is]: null } }] }, order: [["createdAt", "DESC"]], limit: 120 }),
    DocumentoDigital.findAll({ where: { cliente: nome }, order: [["createdAt", "DESC"]], limit: 80 }),
    CertificadoDigital.findAll({ where: { clienteId }, order: [["dataValidade", "DESC"]], limit: 10 }),
    ProcuracaoEcac.findAll({ where: { clienteId }, order: [["dataValidade", "DESC"]], limit: 10 }),
    ServicoAvulso.findAll({ where: { clienteId }, order: [["data", "DESC"], ["createdAt", "DESC"]], limit: 60 }),
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
    servicosCobrancas: servicosCobrancas.map(resumirServicoCobranca),
    documentos: documentos.map(resumirDocumento),
    certificados: certificados.map(resumirCertificado),
    procuracoes: procuracoes.map(resumirProcuracao),
  }
}

async function montarContextoEscritorio(usuario) {
  const [clientes, fiscais, financeiros, documentos, certificados, procuracoes, servicosCobrancas] = await Promise.all([
    Cliente.findAll({ order: [["nome", "ASC"]] }),
    Fiscal.findAll({ order: [["createdAt", "DESC"]], limit: 400 }),
    Financeiro.findAll({ order: [["createdAt", "DESC"]], limit: 400 }),
    DocumentoDigital.findAll({ order: [["createdAt", "DESC"]], limit: 200 }),
    CertificadoDigital.findAll({ order: [["dataValidade", "ASC"]], limit: 200 }),
    ProcuracaoEcac.findAll({ order: [["dataValidade", "ASC"]], limit: 200 }),
    ServicoAvulso.findAll({ order: [["vencimento", "ASC"], ["createdAt", "DESC"]], limit: 300 }),
  ])

  let clientesPermitidos = clientes.filter(clienteOperacional)
  if (usuario?.perfil === "Cliente" && usuario?.clienteVinculado) {
    clientesPermitidos = clientesPermitidos.filter((c) => nomeCliente(c) === usuario.clienteVinculado)
  }

  const nomesPermitidos = new Set(clientesPermitidos.map(nomeCliente))
  const idsPermitidos = new Set(clientesPermitidos.map((c) => Number(c.id)))
  const clientesAcessiveis = usuario?.perfil === "Cliente" && usuario?.clienteVinculado
    ? clientes.filter((c) => nomeCliente(c) === usuario.clienteVinculado)
    : clientes
  const idsClientesAcessiveis = new Set(clientesAcessiveis.map((c) => Number(c.id)))

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
    servicosCobrancas: servicosCobrancas
      .filter((i) => idsClientesAcessiveis.has(Number(i.clienteId)) && !["cancelado"].includes(normalizar(i.status)))
      .map(resumirServicoCobranca),
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

function perguntaProfissionalConceitual(mensagem, historico = []) {
  const textoAtual = normalizar(mensagem)
  const historicoRecente = limparHistorico(historico)
    .slice(-6)
    .map((item) => normalizar(item.texto))
    .join(" ")
  const contexto = `${historicoRecente} ${textoAtual}`

  const temaProfissional = TEMA_PROFISSIONAL_ATUALIZAVEL.test(contexto)
  const pedidoExplicativo = /^(?:e\s+)?(por que|porque|como|o que significa|oque significa|qual tipo|quais tipos|que tipo|qual empresa|quais empresas|qual natureza juridica|quais naturezas juridicas)\b/.test(textoAtual)
  const dependeDeNumeroOuRegraAtual = /(codigo|aliquota|valor|limite|prazo|vencimento|tabela|vigente|atual|atualmente|este ano|neste ano|202[0-9]|nova regra|novo valor)/.test(textoAtual)

  return temaProfissional && pedidoExplicativo && !dependeDeNumeroOuRegraAtual
}

function perguntaExigePesquisaWeb(mensagem, historico = []) {
  if (!PESQUISA_WEB_ATIVA || mensagemEhConversaCasual(mensagem)) return false
  if (perguntaProfissionalConceitual(mensagem, historico)) return false

  const textoAtual = normalizar(mensagem)
  const pedidoExplicito = /(pesquise|pesquisar|procure na internet|busque na internet|consulte a internet|confirme na internet|verifique online|fonte oficial|regra atual|legislacao atual|legislação atual)/.test(textoAtual)
  if (pedidoExplicito) return true

  const perguntaIncompletaDeCalculo = /(quanto|qual(?: e)?(?: o)? valor).*(ele|ela|esse cliente|essa empresa|a empresa).*(imposto|tribut|das)/.test(textoAtual)
    && !/(faturamento|receita|atividade|cnae|anexo|regime|simples|presumido|real|municipio|cidade)/.test(textoAtual)
  if (perguntaIncompletaDeCalculo) return false

  const historicoRecente = limparHistorico(historico)
    .slice(-6)
    .map((item) => normalizar(item.texto))
    .join(" ")
  const contexto = `${historicoRecente} ${textoAtual}`
  const temaProfissional = TEMA_PROFISSIONAL_ATUALIZAVEL.test(contexto)
  const exigeNumeroAtual = /(codigo|aliquota|valor vigente|limite|prazo|vencimento|tabela|salario minimo|contribuicao mensal|percentual atual)/.test(textoAtual)
  const indicioAtualidade = INDICIO_ATUALIDADE.test(textoAtual)

  return temaProfissional && (exigeNumeroAtual || indicioAtualidade)
}

function pesquisaDeveUsarSomenteFontesOficiais(mensagem, historico = []) {
  const texto = `${normalizar(mensagem)} ${limparHistorico(historico).slice(-6).map((item) => normalizar(item.texto)).join(" ")}`
  return TEMA_PROFISSIONAL_ATUALIZAVEL.test(texto)
}

function perguntaPrecisaDadosNexa(mensagem, clienteId, tipoContexto) {
  const texto = normalizar(mensagem)
  const referenciaOperacional = /(meus? clientes?|cliente cadastrado|esse cliente|essa empresa|cliente aberto|escritorio|nexa|pendenc|venciment|financeir|honorario|cobranc|pagament|devendo|quanto deve|servicos? e cobrancas?|documentos? digitais|certificado|procuracao|fiscal|agenda|assistente do dia|dashboard|movimentos? cliente|central do cliente)/.test(texto)
  const pronomeComDadoOperacional = clienteId && /(quanto (?:ele|ela) deve|o que (?:ele|ela) deve|pendencias? (?:dele|dela)|documentos? (?:dele|dela)|fiscal (?:dele|dela)|cobrancas? (?:dele|dela))/.test(texto)
  return referenciaOperacional || pronomeComDadoOperacional || (tipoContexto === "cliente" && referenciaOperacional)
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

function contextoLivre({ nomeUsuario, tipoContexto, interessadoNome, memorias, clienteAtual = null, paginaAtual = "" }) {
  return {
    escopo: tipoContexto === "interessado" ? "novo_atendimento" : "consultoria_livre",
    usuario: { nome: nomeUsuario },
    interessado: tipoContexto === "interessado"
      ? { identificacao: interessadoNome || "Novo atendimento", cadastrado: false }
      : null,
    contextoAmbiente: {
      paginaAtual: paginaAtual || null,
      clienteAberto: clienteAtual || null,
      observacao: "O cliente aberto é apenas contexto de tela. Não presuma que pronomes se referem a ele quando o assunto recente indicar outra pessoa ou conceito.",
    },
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
    historicoSalvo: Boolean(conversa?.id),
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
      ...(querFinanceiro || perguntaGeral ? { servicosCobrancas: (contexto.servicosCobrancas || []).slice(0, 24) } : {}),
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
    ...(querFinanceiro || querCliente || perguntaGeral ? { servicosCobrancas: (contexto.servicosCobrancas || []).slice(0, 30) } : {}),
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
  const personalidade = `Você é a Nexa, colega digital de um escritório contábil brasileiro.
Converse em português do Brasil como uma integrante experiente da equipe: natural, direta, atenta ao contexto e sem linguagem de robô.
Use o nome do usuário somente quando soar natural: ${nomeUsuario}.
Não repita a pergunta, não faça apresentações e não use confirmações mecânicas.
Você pode ter leve descontração e bom humor quando o assunto permitir, mas nunca brinque com valores, prazos, obrigações, riscos ou decisões técnicas.
Quando a conversa continuar um assunto anterior, responda ao contexto sem obrigar o usuário a repetir nomes ou detalhes.`

  const regraDeConcisao = respostaCurta
    ? `Responda normalmente em uma a três frases curtas.
Perguntas muito objetivas podem receber uma única frase.
Não acrescente uma aula, lista ou alerta que não foi solicitado, mas também não responda de forma seca ou telegráfica.`
    : `O usuário pediu explicação. Aprofunde com clareza, mantendo uma conversa fluida e sem enrolação.`

  const regrasDoModo = conversaCasual
    ? `Esta é uma conversa casual. Responda com espontaneidade e cordialidade, sem transformar a conversa em relatório.`
    : `Use o CONTEXTO NEXA quando ele for relevante.
Não invente clientes, datas, valores, pendências, serviços ou ações.
Trate os dados recebidos como a fonte oficial do ERP.
Em perguntas contábeis ou empresariais conceituais, explique a regra geral com naturalidade. Não use a resposta genérica “não consegui confirmar” só porque a pergunta não veio do ERP.
Quando a resposta depender de valor, prazo, código ou norma vigente, deixe claro que esses pontos precisam de validação atual antes de uma decisão definitiva.
Quando houver memórias, use-as discretamente.
Você pode orientar, resumir, comparar e preparar textos, mas nunca diga que alterou, excluiu, enviou ou concluiu algo que não foi realmente executado.`

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

const INTENCOES_CONSULTA_ROTEADOR = new Set([
  "prioridades-hoje",
  "pendencias-gerais",
  "pagamentos-hoje",
  "resolvidas-hoje",
  "mensagens-pendentes",
  "documentos-pendentes",
  "financeiro",
  "fiscal",
  "documentos",
  "certificados",
  "procuracoes",
  "clientes",
  "cliente",
  "atencao",
  "escritorio",
])

function normalizarRotaModelo(valor) {
  const rota = normalizar(valor).replace(/\s+/g, "-")
  if (["navegacao", "consulta", "conversa", "pesquisa", "esclarecer"].includes(rota)) return rota
  return null
}

async function rotearMensagemComModelo({ mensagem, nomeUsuario, historico, paginaAtual = "", clienteAtual = null }) {
  if (!NEXA_MODEL_ROUTER_ATIVO || PROVEDOR_PADRAO !== "groq" || !process.env.GROQ_API_KEY) return null

  const historicoRecente = limparHistorico(historico).slice(-10)
  const mensagens = [
    {
      role: "system",
      content: `Você é o roteador conversacional da Nexa, colega digital do escritório contábil de ${nomeUsuario}.
Classifique a mensagem pela intenção real, considerando o histórico. Não use palavras isoladas para decidir.
ROTAS:
- navegacao: pedido explícito para abrir, entrar, ir, voltar ou mostrar uma tela/cliente.
- consulta: pergunta sobre dados reais cadastrados no ERP.
- conversa: conhecimento geral, explicação, opinião, redação, cálculo genérico ou conversa livre.
- pesquisa: somente quando o usuário pedir pesquisa online ou quando a resposta exigir regra, valor, código, prazo ou notícia atual.
- esclarecer: a pergunta está incompleta e é impossível responder corretamente sem um dado essencial.
INTENÇÕES DE CONSULTA PERMITIDAS:
prioridades-hoje, pendencias-gerais, pagamentos-hoje, resolvidas-hoje, mensagens-pendentes, documentos-pendentes, financeiro, fiscal, documentos, certificados, procuracoes, clientes, cliente, atencao, escritorio.
REGRAS IMPORTANTES:
- “Quais são as pendências?” significa pendencias-gerais e deve reunir somente trabalho aberto do escritório: fiscal, contábil, documentos recebidos de clientes aguardando análise, honorários e financeiro. Documentos enviados ao cliente ou disponíveis para baixar não são pendência do escritório.
- “O que tenho para hoje?”, “resumo do dia” e “relatório para hoje” significam prioridades-hoje, sem abrir Relatórios.
- “Quem pagou hoje?” significa pagamentos-hoje.
- “Tem mensagem de cliente?” significa mensagens-pendentes.
- “Por que contador não pode ser MEI?” é conversa, não consulta do ERP.
- “E qual empresa ele pode abrir?” continua o assunto anterior e é conversa.
- “Quanto ele vai pagar de imposto?” deve ser esclarecer quando faltarem regime, atividade e faturamento; formule uma pergunta curta para obter o dado ausente.
- A tela ou cliente atualmente aberto não substitui o assunto da conversa.
Retorne SOMENTE JSON válido:
{"rota":"consulta|navegacao|conversa|pesquisa|esclarecer","intencao":"uma intenção permitida ou null","resposta":"somente quando rota=esclarecer","motivo":"frase curta"}`,
    },
    ...historicoRecente.map((item) => ({
      role: item.autor === "usuario" ? "user" : "assistant",
      content: item.texto,
    })),
    {
      role: "user",
      content: `MENSAGEM ATUAL: ${String(mensagem || "").slice(0, 1200)}\nTELA ATUAL: ${paginaAtual || "não informada"}\nCLIENTE ABERTO: ${JSON.stringify(clienteAtual || null)}`,
    },
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 22000)
  try {
    const resposta = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODELO_PADRAO,
        messages: mensagens,
        max_tokens: 220,
        temperature: 0.05,
      }),
    })
    const dados = await resposta.json().catch(() => ({}))
    if (!resposta.ok) throw new Error(dados?.error?.message || `Groq respondeu com status ${resposta.status}`)
    const objeto = extrairObjetoJsonLivre(extrairTextoGroq(dados))
    const rota = normalizarRotaModelo(objeto?.rota)
    if (!rota) return null
    const intencaoCandidata = normalizar(objeto?.intencao).replace(/\s+/g, "-")
    const intencao = INTENCOES_CONSULTA_ROTEADOR.has(intencaoCandidata) ? intencaoCandidata : null
    return {
      rota,
      intencao,
      resposta: String(objeto?.resposta || "").trim(),
      motivo: String(objeto?.motivo || "").trim(),
      modelo: MODELO_PADRAO,
    }
  } catch (error) {
    console.warn("ROTEADOR CONVERSACIONAL DA NEXA INDISPONIVEL:", error?.message || error)
    return null
  } finally {
    clearTimeout(timeout)
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
  const ehContinuacao = CONTINUACAO_CURTA.test(normalizar(mensagem))
  const contextoRecente = ehContinuacao
    ? limparHistorico(historico)
      .slice(-4)
      .map((item) => `${item.autor === "usuario" ? "Usuário" : "Nexa"}: ${item.texto}`)
      .join("\n")
      .slice(0, 2400)
    : ""

  // Payload mínimo, seguindo o quickstart oficial do Groq Compound.
  // Não envia histórico, dados de clientes, memórias, contexto interno nem opções extras.
  const promptPesquisa = `${regraFontes}
${regraResposta}
Nunca chute códigos, valores, alíquotas, categorias, prazos ou regras.
Se não encontrar confirmação segura, responda exatamente: Não consegui confirmar essa informação com segurança.
Retorne SOMENTE JSON válido, sem markdown e sem links, no formato:
{"resposta":"texto","pontos":[],"recomendacao":"","fundamentos":[],"confirmado":true}

${contextoRecente ? `Contexto recente da conversa (use apenas para entender pronomes e continuações):\n${contextoRecente}\n` : ""}
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

  const usarPesquisa = parametros.forcarPesquisaWeb === true
    || (parametros.bloquearPesquisaWeb !== true && perguntaExigePesquisaWeb(parametros.mensagem, parametros.historico))
  if (usarPesquisa) {
    const pesquisada = await gerarRespostaComPesquisa(parametros)
    if (pesquisada?.confirmado !== false && pesquisada?.resposta) return pesquisada

    const respostaNatural = await gerarRespostaPadrao({
      ...parametros,
      contexto: {
        ...(parametros.contexto || {}),
        pesquisaOnline: "A pesquisa online não confirmou uma fonte suficiente. Responda de forma útil com conhecimento geral, deixando claro quando um dado atual precisa ser verificado, sem usar uma recusa genérica.",
      },
    })
    return {
      ...respostaNatural,
      pesquisaWeb: false,
      pesquisaWebIndisponivel: true,
    }
  }
  return gerarRespostaPadrao(parametros)
}

function compactarResultadoParaConversa(resultado) {
  const consulta = resultado?.consulta || null
  return {
    respostaBase: String(resultado?.resposta || "").slice(0, 1800),
    pontos: Array.isArray(resultado?.pontos) ? resultado.pontos.slice(0, 8) : [],
    recomendacao: String(resultado?.recomendacao || "").slice(0, 600),
    acao: resultado?.acao || null,
    consulta: consulta ? {
      tipo: consulta.tipo,
      titulo: consulta.titulo,
      resumo: consulta.resumo,
      total: consulta.total,
      valorTotalFormatado: consulta.valorTotalFormatado,
      cliente: consulta.cliente,
      itens: Array.isArray(consulta.itens) ? consulta.itens.slice(0, 40) : [],
      novidades: Array.isArray(consulta.novidades) ? consulta.novidades.slice(0, 30) : [],
      prioridadePrincipal: consulta.prioridadePrincipal || null,
      clientesComPendencias: consulta.clientesComPendencias,
    } : null,
  }
}

function clientesAusentesNaResposta({ texto, itens = [], limite = 20 }) {
  const respostaNormalizada = normalizar(texto)
  const nomes = [...new Set(
    (Array.isArray(itens) ? itens : [])
      .map((item) => String(item?.cliente || "").trim())
      .filter(Boolean),
  )].slice(0, limite)

  return nomes.filter((nome) => {
    const nomeNormalizado = normalizar(nome)
    if (!nomeNormalizado) return false
    if (respostaNormalizada.includes(nomeNormalizado)) return false

    // Aceita também o primeiro nome significativo, útil quando a Nexa usa uma
    // forma natural como “Matheus” em vez de repetir “Matheus Barreto”.
    const token = nomeNormalizado
      .split(/\s+/)
      .find((parte) => parte.length >= 4 && !["cliente", "empresa", "comercio", "servicos", "ltda", "limitada"].includes(parte))
    return !token || !new RegExp(`(^|\\s)${escaparRegex(token)}(?=\\s|$)`).test(respostaNormalizada)
  })
}

async function naturalizarResultadoSistema({
  mensagem,
  nomeUsuario,
  historico,
  resultado,
  origem = "texto",
  paginaAtual = "",
  clienteAtual = null,
  atividade = "consulta",
}) {
  const base = {
    ...resultado,
    conversacionalV2: true,
    atividade,
  }

  if (!NEXA_CONVERSACIONAL_V2_ATIVA || PROVEDOR_PADRAO !== "groq" || !process.env.GROQ_API_KEY) {
    return {
      ...base,
      ...(origem === "voz" ? { fala: resultado?.fala || resultado?.resposta } : {}),
    }
  }

  const historicoRecente = limparHistorico(historico).slice(-10)
  const contextoConfirmado = compactarResultadoParaConversa(resultado)
  const tipoConsulta = contextoConfirmado?.consulta?.tipo || ""
  const consultaPrioridades = tipoConsulta === "prioridades-hoje"
  const consultaPendencias = tipoConsulta === "pendencias-gerais"
  const consultaNovidades = ["pagamentos-hoje", "resolvidas-hoje"].includes(tipoConsulta)
  const consultaComListaCompleta = consultaPrioridades || consultaPendencias || consultaNovidades || ["mensagens-pendentes", "documentos-pendentes"].includes(tipoConsulta)
  const instrucaoAtividade = atividade === "navegacao"
    ? "A navegação indicada em ACAO CONFIRMADA será executada logo após sua resposta. Confirme de forma breve e natural, sem dizer 'com segurança', 'comando concluído' ou frases técnicas."
    : consultaPrioridades
      ? "Os dados vieram do ERP. Faça o resumo do dia em duas partes: prioridades abertas e novidades de hoje. Cite cliente, pendência, valor e vencimento quando existirem. Informe claramente a prioridade principal. Inclua pagamentos e pendências resolvidas presentes em novidades. Não abra Relatórios."
      : consultaPendencias
        ? "Os dados vieram do ERP. Relacione todos os clientes presentes nos itens. Considere somente fiscal, contábil, documentos recebidos dos clientes, honorários e financeiro. Documentos enviados ao cliente ou disponíveis para baixar não são pendência. Ao final, informe a prioridade principal. Não omita clientes."
        : consultaNovidades
          ? "Os dados vieram do ERP. Relacione todos os pagamentos ou pendências resolvidas presentes nos itens, com cliente, motivo e valor quando existir."
          : "Os DADOS CONFIRMADOS vieram diretamente do ERP. Responda à pergunta com esses dados exatos e destaque apenas o que realmente ajuda."

  const mensagens = [
    {
      role: "system",
      content: `Você é a Nexa, colega digital do escritório contábil de ${nomeUsuario}.
Fale como uma colega de equipe: natural, direta, cordial e contextual.
${instrucaoAtividade}
Você pode usar humor leve e inteligente quando couber, mas nunca em valores, prazos, obrigações ou riscos.
Não mencione ferramenta, API, banco de dados, JSON, modelo ou processamento.
Não invente nada e não altere números, nomes, datas ou status.
Evite confirmações robóticas como “comando concluído”, “consulta realizada” e “tela aberta com segurança”.
Responda em uma a três frases. Retorne SOMENTE JSON válido no formato {"resposta":"texto"}.`,
    },
    ...historicoRecente.map((item) => ({
      role: item.autor === "usuario" ? "user" : "assistant",
      content: item.texto,
    })),
    {
      role: "user",
      content: `MENSAGEM ATUAL:
${String(mensagem || "").slice(0, 1000)}

TELA ATUAL:
${paginaAtual || "não informada"}

CLIENTE ATUAL:
${JSON.stringify(clienteAtual || null)}

DADOS CONFIRMADOS / ACAO CONFIRMADA:
${JSON.stringify(contextoConfirmado)}`,
    },
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const resposta = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODELO_PADRAO,
        messages: mensagens,
        max_tokens: consultaComListaCompleta ? 1200 : 520,
        temperature: consultaComListaCompleta ? 0.35 : 0.68,
      }),
    })

    const dados = await resposta.json().catch(() => ({}))
    if (!resposta.ok) throw new Error(dados?.error?.message || `Groq respondeu com status ${resposta.status}`)

    const interpretado = interpretarJson(extrairTextoGroq(dados))
    const texto = String(interpretado.resposta || "").trim()
    if (!texto) return base

    // Em consultas completas, naturalidade nunca pode custar informação.
    // Se o modelo omitir qualquer cliente retornado pelo ERP, usa a resposta
    // determinística já montada pelo sistema, que contém a lista completa.
    if (["pendencias-gerais", "prioridades-hoje"].includes(tipoConsulta)) {
      const ausentes = clientesAusentesNaResposta({
        texto,
        itens: contextoConfirmado?.consulta?.itens || [],
      })
      if (ausentes.length) {
        return {
          ...base,
          ...(origem === "voz" ? { fala: resultado?.fala || resultado?.resposta } : {}),
          validacaoListaCompleta: true,
          clientesQueSeriamOmitidos: ausentes,
        }
      }
    }

    return {
      ...base,
      resposta: texto,
      ...(origem === "voz" ? { fala: texto } : {}),
      modo: `${resultado?.modo || "sistema"}-conversacional-v2.1`,
      modelo: `${MODELO_PADRAO} + Nexa Conversacional v2.1`,
    }
  } catch (error) {
    console.warn("NATURALIZACAO CONVERSACIONAL DA NEXA INDISPONIVEL:", error?.message || error)
    return {
      ...base,
      ...(origem === "voz" ? { fala: resultado?.fala || resultado?.resposta } : {}),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function status(req, res) {
  const apiKey = process.env.GROQ_API_KEY
  const base = {
    provedorPrincipal: PROVEDOR_PADRAO,
    conversacionalV2: NEXA_CONVERSACIONAL_V2_ATIVA,
    roteadorPorModelo: NEXA_MODEL_ROUTER_ATIVO,
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
    const mensagemOriginal = String(req.body?.mensagem || "").trim()
    const clienteId = req.body?.clienteId ? Number(req.body.clienteId) : null
    const vocabulario = await aplicarVocabulario({
      usuarioId: req.usuario.id,
      clienteId,
      texto: mensagemOriginal,
    })
    let mensagem = vocabulario.texto
    const conversaId = req.body?.conversaId ? Number(req.body.conversaId) : null
    const tipoContexto = ["geral", "cliente", "interessado"].includes(req.body?.tipoContexto)
      ? req.body.tipoContexto
      : (clienteId ? "cliente" : "geral")
    const interessadoNome = String(req.body?.interessadoNome || "").trim()
    let respostaCurta = !perguntaPedeDetalhes(mensagem)

    if (!mensagem) {
      return res.status(400).json({ message: "Escreva uma pergunta para a Nexa" })
    }

    const usuarioBanco = await Usuario.findByPk(req.usuario.id)
    const nomeUsuario = usuarioBanco?.nome || "Administrador"
    const persistido = conversaId ? await historicoPersistente(conversaId, req.usuario.id) : []
    const historico = persistido.length ? persistido : limparHistorico(req.body?.historico)
    const correcaoContextual = corrigirTranscricaoPeloContexto({
      mensagem,
      historico,
      origem: req.body?.origem || "texto",
    })
    mensagem = correcaoContextual.texto
    respostaCurta = !perguntaPedeDetalhes(mensagem)
    const memorias = await obterMemoriasRelevantes({
      usuarioId: req.usuario.id,
      clienteId,
      conversaId,
      tipoContexto,
    })
    const conversaCasual = mensagemEhConversaCasual(mensagem)

    let contextoNexa
    if (conversaCasual || tipoContexto === "interessado" || !perguntaPrecisaDadosNexa(mensagem, clienteId, tipoContexto)) {
      const clienteAtualBanco = clienteId ? await Cliente.findByPk(clienteId) : null
      contextoNexa = contextoLivre({
        nomeUsuario,
        tipoContexto,
        interessadoNome,
        memorias,
        clienteAtual: clienteAtualBanco ? { id: clienteAtualBanco.id, nome: nomeCliente(clienteAtualBanco) } : null,
        paginaAtual: String(req.body?.paginaAtual || ""),
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
      vocabularioAplicado: vocabulario.alterada,
      correcaoContextualAplicada: correcaoContextual.alterada,
      substituicoesVocabulario: [
        ...(vocabulario.substituicoes || []),
        ...(correcaoContextual.substituicoes || []),
      ],
      conversacionalV2: NEXA_CONVERSACIONAL_V2_ATIVA,
      transcricaoOriginal: (vocabulario.alterada || correcaoContextual.alterada) ? mensagemOriginal : undefined,
      transcricaoCorrigida: (vocabulario.alterada || correcaoContextual.alterada) ? mensagem : undefined,
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
    const mensagemOriginal = String(req.body?.mensagem || "").trim()
    const clienteId = req.body?.clienteId ? Number(req.body.clienteId) : null
    const vocabulario = await aplicarVocabulario({
      usuarioId: req.usuario.id,
      clienteId,
      texto: mensagemOriginal,
    })
    let mensagem = vocabulario.texto
    const conversaId = req.body?.conversaId ? Number(req.body.conversaId) : null
    const tipoContexto = ["geral", "cliente", "interessado"].includes(req.body?.tipoContexto)
      ? req.body.tipoContexto
      : (clienteId ? "cliente" : "geral")
    const interessadoNome = String(req.body?.interessadoNome || "").trim()
    const origem = normalizar(req.body?.origem) || "texto"
    const paginaAtual = String(req.body?.paginaAtual || "").trim()
    const selecaoClientePendente = req.body?.selecaoClientePendente || null
    const selecaoClienteId = req.body?.selecaoClienteId ? Number(req.body.selecaoClienteId) : null
    const cancelarSelecaoCliente = Boolean(req.body?.cancelarSelecaoCliente)

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
    const correcaoContextual = corrigirTranscricaoPeloContexto({ mensagem, historico, origem })
    mensagem = correcaoContextual.texto
    const mensagemAlterada = Boolean(vocabulario.alterada || correcaoContextual.alterada)
    const substituicoesAplicadas = [
      ...(vocabulario.substituicoes || []),
      ...(correcaoContextual.substituicoes || []),
    ]

    await salvarMensagemConversa({
      conversa,
      usuarioId: req.usuario.id,
      autor: "usuario",
      texto: mensagemAlterada ? mensagem : mensagemOriginal,
      dados: {
        origem,
        paginaAtual: paginaAtual || null,
        ...(mensagemAlterada
          ? {
            transcricaoOriginal: mensagemOriginal,
            transcricaoCorrigida: mensagem,
            substituicoesVocabulario: substituicoesAplicadas,
          }
          : {}),
      },
    })

    const instrucaoVocabulario = detectarInstrucaoDeAprendizado(mensagemOriginal)
    if (instrucaoVocabulario) {
      const aprendizado = await aprenderTermoVoz({
        usuarioId: req.usuario.id,
        clienteId,
        termoOuvido: instrucaoVocabulario.termoOuvido,
        termoCorreto: instrucaoVocabulario.termoCorreto,
        origem: "ensino_direto",
      })
      const textoResposta = aprendizado.igual
        ? "Essas duas formas já são iguais."
        : `Entendido. Vou reconhecer “${instrucaoVocabulario.termoOuvido}” como “${instrucaoVocabulario.termoCorreto}”.`

      await salvarMensagemConversa({
        conversa,
        usuarioId: req.usuario.id,
        autor: "nexa",
        texto: textoResposta,
        dados: { vocabularioAprendido: Boolean(aprendizado.registrada) },
      })

      return res.json(anexarMetadadosConversa({
        resposta: textoResposta,
        pontos: [],
        recomendacao: "",
        fundamentos: [],
        modo: "vocabulario-voz",
        provedor: "sistema",
        modelo: "Nexa Voice Vocabulary 1.0",
        vocabularioAprendido: Boolean(aprendizado.registrada),
        respondidoEm: new Date().toISOString(),
      }, conversa))
    }

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

    const selecaoResolvida = await resolverSelecaoClientePendente({
      selecao: selecaoClientePendente,
      clienteSelecionadoId: selecaoClienteId,
      cancelar: cancelarSelecaoCliente,
      clienteIdAtual: clienteId,
      usuario: usuarioCompleto,
    })

    if (selecaoResolvida) {
      await salvarMensagemConversa({
        conversa,
        usuarioId: req.usuario.id,
        autor: "nexa",
        texto: selecaoResolvida.resposta,
        dados: selecaoResolvida,
      })
      return res.json(anexarMetadadosConversa(selecaoResolvida, conversa))
    }

    const clienteAtualBanco = clienteId ? await Cliente.findByPk(clienteId) : null
    const clienteAtualResumo = clienteAtualBanco ? { id: clienteAtualBanco.id, nome: nomeCliente(clienteAtualBanco) } : null
    const decisaoOperacional = classificarMensagemOperacional(mensagem)
    const fluxoOperacionalDeterministico = Boolean(decisaoOperacional)
      || mensagemOperacionalDeterministica(mensagem)
      || pareceComandoNavegacao(normalizar(mensagem))
    const rotaModelo = fluxoOperacionalDeterministico
      ? null
      : await rotearMensagemComModelo({
        mensagem,
        nomeUsuario,
        historico,
        paginaAtual,
        clienteAtual: clienteAtualResumo,
      })

    let comandoNavegacao = null
    const deveTentarNavegacao = decisaoOperacional?.tipo === "navegacao"
      || rotaModelo?.rota === "navegacao"
      || (!rotaModelo && pareceComandoNavegacao(normalizar(mensagem)))
    if (deveTentarNavegacao) {
      const parametrosNavegacao = {
        mensagem,
        clienteId,
        usuario: usuarioCompleto,
        origem,
        paginaAtual,
        historico,
      }
      comandoNavegacao = decisaoOperacional?.tipo === "navegacao"
        ? await detectarComandoNavegacaoDeterministico(parametrosNavegacao)
        : await detectarComandoNavegacao(parametrosNavegacao)
    }

    if (comandoNavegacao) {
      const respostaNavegacao = fluxoOperacionalDeterministico
        ? { ...comandoNavegacao, conversacionalV2: true, atividade: "navegacao" }
        : await naturalizarResultadoSistema({
          mensagem,
          nomeUsuario,
          historico,
          resultado: comandoNavegacao,
          origem,
          paginaAtual,
          clienteAtual: clienteAtualResumo,
          atividade: "navegacao",
        })

      await salvarMensagemConversa({
        conversa,
        usuarioId: req.usuario.id,
        autor: "nexa",
        texto: respostaNavegacao.resposta,
        dados: { ...respostaNavegacao, roteadorModelo: rotaModelo },
      })
      return res.json(anexarMetadadosConversa({
        ...respostaNavegacao,
        roteadorModelo: rotaModelo,
        roteadorOperacional: decisaoOperacional,
      }, conversa))
    }

    if (rotaModelo?.rota === "esclarecer" && rotaModelo.resposta) {
      const respostaEsclarecimento = {
        resposta: rotaModelo.resposta,
        ...(origem === "voz" ? { fala: rotaModelo.resposta } : {}),
        pontos: [],
        recomendacao: "",
        fundamentos: [],
        modo: "nexa-conversacional-v2.1-esclarecimento",
        provedor: "groq",
        modelo: `${MODELO_PADRAO} + roteador`,
        atividade: "esclarecimento",
        conversacionalV2: true,
        roteadorModelo: rotaModelo,
        respondidoEm: new Date().toISOString(),
      }
      await salvarMensagemConversa({
        conversa,
        usuarioId: req.usuario.id,
        autor: "nexa",
        texto: respostaEsclarecimento.resposta,
        dados: respostaEsclarecimento,
      })
      return res.json(anexarMetadadosConversa(respostaEsclarecimento, conversa))
    }

    let consultaInteligente = null
    const deveTentarConsulta = conversa.tipoContexto !== "interessado"
      && (decisaoOperacional?.tipo === "consulta" || rotaModelo?.rota === "consulta" || !rotaModelo)
    if (deveTentarConsulta) {
      consultaInteligente = await detectarConsultaInteligente({
        mensagem,
        clienteId,
        usuario: usuarioCompleto,
        intencaoForcada: decisaoOperacional?.tipo === "consulta"
          ? decisaoOperacional.intencao
          : (rotaModelo?.rota === "consulta" ? rotaModelo.intencao : null),
      })
    }

    if (consultaInteligente) {
      const respostaConsultaNatural = fluxoOperacionalDeterministico
        ? { ...consultaInteligente, conversacionalV2: true, atividade: "consulta", provedor: "sistema", modelo: "Nexa Operacional Determinística 1.0" }
        : await naturalizarResultadoSistema({
          mensagem,
          nomeUsuario,
          historico,
          resultado: consultaInteligente,
          origem,
          paginaAtual,
          clienteAtual: clienteAtualResumo,
          atividade: "consulta",
        })

      const respostaComRota = {
        ...respostaConsultaNatural,
        roteadorModelo: rotaModelo,
        roteadorOperacional: decisaoOperacional,
      }
      await salvarMensagemConversa({
        conversa,
        usuarioId: req.usuario.id,
        autor: "nexa",
        texto: respostaComRota.resposta,
        dados: respostaComRota,
      })
      return res.json(anexarMetadadosConversa(respostaComRota, conversa))
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
    const rotaLivre = ["conversa", "pesquisa", "esclarecer"].includes(rotaModelo?.rota)
    if (conversaCasual || rotaLivre || conversa.tipoContexto === "interessado" || !perguntaPrecisaDadosNexa(mensagem, clienteId, conversa.tipoContexto)) {
      contextoNexa = contextoLivre({
        nomeUsuario,
        tipoContexto: conversa.tipoContexto,
        interessadoNome: conversa.interessadoNome,
        memorias,
        clienteAtual: clienteAtualResumo,
        paginaAtual,
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
      forcarPesquisaWeb: rotaModelo?.rota === "pesquisa",
      bloquearPesquisaWeb: rotaModelo?.rota === "conversa",
    })

    const respostaFinal = {
      ...resultado,
      ...(origem === "voz" ? { fala: resultado.resposta } : {}),
      modo: resultado.pesquisaWeb ? "groq-pesquisa-web" : "groq-online",
      provedor: "groq",
      modelo: resultado.modeloUsado || MODELO_PADRAO,
      respondidoEm: new Date().toISOString(),
      memoriaAtiva: true,
      memoriasUsadas: memorias.length,
      vocabularioAplicado: vocabulario.alterada,
      correcaoContextualAplicada: correcaoContextual.alterada,
      substituicoesVocabulario: substituicoesAplicadas,
      conversacionalV2: NEXA_CONVERSACIONAL_V2_ATIVA,
      roteadorModelo: rotaModelo,
      atividade: resultado.pesquisaWeb ? "pesquisa" : "conversa",
      transcricaoOriginal: mensagemAlterada ? mensagemOriginal : undefined,
      transcricaoCorrigida: mensagemAlterada ? mensagem : undefined,
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
    const falhaProvedor = Boolean(error.providerFailure)
    return res.status(error.statusCode || 500).json({
      message: falhaProvedor
        ? "A conversa geral está temporariamente indisponível. As consultas e navegações da Nexa continuam funcionando normalmente."
        : (error.message || "Não consegui concluir essa solicitação agora."),
      providerFailure: falhaProvedor,
      provedor: PROVEDOR_PADRAO,
      conversaId: conversa?.id || null,
      conversaTitulo: conversa?.titulo || null,
    })
  }
}
module.exports = { conversar, contexto, status }

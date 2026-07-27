const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const CertificadoDigital = require("../models/CertificadoDigital")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")
const SolicitacaoCliente = require("../models/SolicitacaoCliente")
const ServicoAvulso = require("../models/ServicoAvulso")
const Agenda = require("../models/Agenda")
const {
  financeiroAbertoParaPrioridade,
  financeiroDoEscritorioParaPrioridade,
  servicoAbertoParaPrioridade,
  solicitacaoAbertaParaPrioridade,
  deduplicarFiscaisAbertos,
} = require("./pendenciaFiltersService")

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function nomeCliente(cliente) {
  return cliente?.nome || cliente?.razaoSocial || cliente?.nomeFantasia || "Cliente"
}

function encerrado(status) {
  const texto = normalizar(status)
  return ["pago", "recebido", "concluido", "entregue", "quitado", "conferido", "finalizado", "cancelado", "arquivado"].includes(texto)
    || /(concluid|finalizad|cancelad|arquivad|atendid|resolvid)/.test(texto)
}

function recebido(status) {
  return /(recebid|pago|quitad)/.test(normalizar(status))
}

function concluido(status) {
  return /(concluid|finalizad|entregue|conferid|resolvid)/.test(normalizar(status))
}

function documentoConcluido(status) {
  const texto = normalizar(status)
  if (texto.includes("entregue pelo cliente")) return false
  return /(concluid|finalizad|conferid|arquivad|entregue ao cliente|recebido pelo cliente)/.test(texto)
}

function clienteAtivo(cliente) {
  const situacao = normalizar(cliente?.statusOperacional || cliente?.situacaoEmpresa || cliente?.situacao)
  return !["baixada", "inapta", "suspensa", "encerrada", "pausada"].includes(situacao)
}

function converterData(valor) {
  if (!valor) return null
  const texto = String(valor).trim().slice(0, 10)
  let ano
  let mes
  let dia

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    ;[ano, mes, dia] = texto.split("-").map(Number)
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) {
    ;[dia, mes, ano] = texto.split("/").map(Number)
  } else {
    const data = new Date(valor)
    if (Number.isNaN(data.getTime())) return null
    return new Date(data.getFullYear(), data.getMonth(), data.getDate())
  }

  const data = new Date(ano, mes - 1, dia)
  return Number.isNaN(data.getTime()) ? null : data
}

function diasAte(valor) {
  const data = converterData(valor)
  if (!data) return null
  const hoje = new Date()
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((data - base) / 86400000)
}

function formatarData(valor) {
  const data = converterData(valor)
  return data ? data.toLocaleDateString("pt-BR") : "Data não informada"
}

function partesDataBrasil(valor) {
  if (!valor) return null
  const data = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(data.getTime())) return null
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data)
  const mapa = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]))
  return `${mapa.year}-${mapa.month}-${mapa.day}`
}

function hojeBrasil() {
  return partesDataBrasil(new Date())
}

function dataEhHoje(valor) {
  if (!valor) return false
  const texto = String(valor).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto === hojeBrasil()
  return partesDataBrasil(valor) === hojeBrasil()
}

function textoPrazo(dias) {
  if (dias === null) return "Prazo não identificado"
  if (dias < 0) return `Vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`
  if (dias === 0) return "Vence hoje"
  if (dias === 1) return "Vence amanhã"
  return `Vence em ${dias} dias`
}

function numeroMoeda(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0
  let texto = String(valor || "").replace(/R\$/gi, "").replace(/\s/g, "")
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".")
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function respostaConsulta({ resposta, fala = "", pontos = [], recomendacao = "", consulta }) {
  return {
    resposta,
    ...(fala ? { fala } : {}),
    pontos,
    recomendacao,
    fundamentos: ["Consulta realizada diretamente nos dados atuais da Nexa."],
    modo: "consulta-inteligente",
    provedor: "sistema",
    modelo: "Nexa Consultas 4.2.2",
    consulta,
    respondidoEm: new Date().toISOString(),
    aviso: "Consulta segura realizada. Nenhum dado foi alterado.",
  }
}

function acaoPagina(pagina, cliente = null, alvo = "pagina") {
  return {
    tipo: "navegar",
    pagina,
    alvo,
    segura: true,
    cliente: cliente ? { id: cliente.id, nome: nomeCliente(cliente) } : null,
  }
}

function periodo(texto, padrao = null) {
  if (/(vencid|atrasad|em atraso)/.test(texto)) return { tipo: "vencidos" }
  if (/(vence hoje|vencem hoje|de hoje|hoje)/.test(texto)) return { tipo: "hoje" }
  if (/amanha/.test(texto)) return { tipo: "faixa", min: 1, max: 1, rotulo: "amanhã" }

  const match = texto.match(/(?:proximos?|em ate|dentro de)?\s*(\d{1,3})\s+dias?/) 
  if (match) {
    const dias = Math.max(1, Math.min(365, Number(match[1])))
    return { tipo: "faixa", min: 0, max: dias, rotulo: `nos próximos ${dias} dias` }
  }
  if (/semana/.test(texto)) return { tipo: "faixa", min: 0, max: 7, rotulo: "nos próximos 7 dias" }
  if (/mes/.test(texto)) return { tipo: "faixa", min: 0, max: 30, rotulo: "nos próximos 30 dias" }
  return padrao
}

function filtrarPeriodo(itens, config, campo) {
  if (!config) return itens
  return itens.filter((item) => {
    const dias = diasAte(item?.[campo])
    if (dias === null) return false
    if (config.tipo === "vencidos") return dias < 0
    if (config.tipo === "hoje") return dias === 0
    if (config.tipo === "faixa") return dias >= config.min && dias <= config.max
    return true
  })
}

function ordenarData(itens, campo) {
  return [...itens].sort((a, b) => {
    const da = converterData(a?.[campo])?.getTime() ?? Number.MAX_SAFE_INTEGER
    const db = converterData(b?.[campo])?.getTime() ?? Number.MAX_SAFE_INTEGER
    return da - db
  })
}

async function carregarClientes(usuario) {
  let clientes = await Cliente.findAll({ order: [["nome", "ASC"]] })
  if (usuario?.perfil === "Cliente" && usuario?.clienteVinculado) {
    const permitido = normalizar(usuario.clienteVinculado)
    clientes = clientes.filter((cliente) => normalizar(nomeCliente(cliente)) === permitido)
  }
  return clientes
}

function localizarCliente(clientes, texto, clienteId) {
  const atual = clienteId ? clientes.find((cliente) => String(cliente.id) === String(clienteId)) : null
  const ignoradas = new Set(["cliente", "empresa", "comercio", "servicos", "ltda", "limitada", "mei", "eireli"])
  const candidatos = clientes
    .map((cliente) => {
      const nome = normalizar(nomeCliente(cliente))
      let score = texto.includes(nome) ? 1000 + nome.length : 0
      if (!score) {
        const tokens = nome.split(/\s+/).filter((token) => token.length >= 4 && !ignoradas.has(token))
        score = tokens.reduce((total, token) => total + (texto.includes(token) ? token.length : 0), 0)
      }
      return { cliente, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (candidatos.length > 1 && candidatos[0].score === candidatos[1].score) {
    return { ambiguo: true, cliente: null, explicito: true, atual }
  }

  const encontrado = candidatos[0]?.cliente || null
  return {
    ambiguo: false,
    cliente: encontrado || atual || null,
    explicito: Boolean(encontrado),
    atual,
  }
}

function pedidoPrioridadesHoje(texto) {
  return /(qual(?: e)?(?: a)? prioridade(?: principal| mais urgente)?(?: para| de)? hoje|qual(?: e)?(?: a)? prioridade mais urgente|quais(?: sao)?(?: as)? prioridades?(?: para| de)? hoje|prioridades? do dia|o que (?:eu )?(?:tenho|preciso) (?:para )?(?:fazer|resolver) hoje|o que e mais urgente hoje|por onde (?:eu )?comeco hoje|como esta meu dia|organize meu dia|(?:faca |me (?:de|passe|mostre|fale) )?(?:um )?(?:relatorio|resumo|panorama)(?: operacional| completo)? (?:de|do|para|pra) (?:hoje|dia)|(?:relatorio|resumo) de hoje)/.test(texto)
}

function pedidoTodasPendencias(texto) {
  return /(todas?(?: as)? pendencias|quais(?: sao)?(?: as)? pendencias|liste(?: todas)?(?: as)? pendencias|mostre(?: todas)?(?: as)? pendencias|tem alguma pendencia|ha alguma pendencia|o que esta pendente|quem esta pendente|clientes? com pendencia|pendencias? do escritorio|resumo das pendencias)/.test(texto)
    && !/(somente|apenas).*(fiscal|das|financeir|cobranc|document|mensag)/.test(texto)
}

function pedidoPagamentosHoje(texto) {
  return /(quem pagou(?: hoje)?|algum cliente pagou|clientes? que pagaram|pagamentos? recebidos?(?: hoje)?|recebimentos? de hoje|quanto entrou(?: de servicos?)? hoje|quem quitou|quitou alguma pendencia|algum cliente quitou)/.test(texto)
}

function pedidoResolvidasHoje(texto) {
  return /(pendencias? resolvidas?(?: hoje)?|o que foi (?:resolvido|concluido|finalizado) hoje|quais(?: as)? pendencias? (?:foram )?(?:concluidas|resolvidas)|atualizacoes? concluidas? de hoje)/.test(texto)
}

function pedidoMensagensAbertas(texto) {
  return /(mensagens? (?:dos?|de) clientes?|clientes? pedindo ajuda|pedidos? de ajuda|solicitacoes? (?:dos?|de) clientes?|quem pediu ajuda|mensagens? sem resposta|novas? interacoes?)/.test(texto)
}

function pedidoDocumentosPendentes(texto) {
  return /(documentos? (?:pendentes?|aguardando|recebidos?|enviados?|no escritorio)|arquivos? (?:pendentes?|aguardando|recebidos?)|o que chegou de documento|documentos? para analisar|documentos? sem conferir)/.test(texto)
}

function consultaSolicitada(texto, cliente = null, clienteId = null) {
  const pedidoOperacionalDireto = pedidoPrioridadesHoje(texto)
    || pedidoTodasPendencias(texto)
    || pedidoPagamentosHoje(texto)
    || pedidoResolvidasHoje(texto)
    || pedidoMensagensAbertas(texto)
    || pedidoDocumentosPendentes(texto)
  if (pedidoOperacionalDireto) return true

  const verboConsulta = /(^|\s)(mostre|mostrar|liste|listar|consulte|consultar|verifique|verificar|busque|buscar|procure|procurar|resuma|resumir|resumo|qual|quais|quanto|quantos|quantas|existe|existem|tem|ha|como esta|situacao|status)(\s|$)/.test(texto)
  const referenciaSistema = /(na nexa|no sistema|cadastrad|registrad|lancad|meus? clientes?|minhas? pendencias?|do escritorio|da carteira|cliente selecionado|desse cliente|deste cliente)/.test(texto)
  const estadoOperacional = /(pendenc|em aberto|vencid|vencendo|vence hoje|vencem hoje|atrasad|pago|recebido|concluido|prioridade|atencao|devendo|\bdeve\b|quanto deve)/.test(texto)
  const objetoOperacional = /(clientes?|fiscal|obrigac|pendenc|document|arquivo|anexo|certificad|procurac|financeir|honor|cobranc|inadimpl|pagament|devendo|\bdeve\b|quanto deve|moviment|agenda|assistente do dia|venciment|das|mensag|solicitac)/.test(texto)
  const fraseEscritorio = /(como esta o escritorio|resumo do escritorio|escritorio hoje|situacao do escritorio|prioridades de hoje)/.test(texto)
  const fraseAtencao = /(clientes?).*(atencao|prioridade|critico|pendenc)|precisam de atencao|precisa de atencao/.test(texto)
  const listaClientes = /(clientes? ativos?|quantos clientes|lista de clientes|carteira de clientes|meus? clientes?)/.test(texto)
  const clienteIdentificado = Boolean(cliente || clienteId)
  const dadoDoCliente = clienteIdentificado
    && verboConsulta
    && /(como esta|situacao|resumo|dados|regime|ramo|cnpj|das|obrigac|pendenc|venciment|document|arquivo|anexo|certificad|procurac|financeir|honor|cobranc|moviment|competencia|mensag|solicitac)/.test(texto)

  return fraseEscritorio || fraseAtencao || listaClientes || dadoDoCliente
    || (verboConsulta && objetoOperacional && (referenciaSistema || estadoOperacional))
}

function identificarIntencao(texto, cliente) {
  if (pedidoPagamentosHoje(texto)) return "pagamentos-hoje"
  if (pedidoResolvidasHoje(texto)) return "resolvidas-hoje"
  if (pedidoMensagensAbertas(texto)) return "mensagens-pendentes"
  if (pedidoDocumentosPendentes(texto)) return "documentos-pendentes"
  if (pedidoTodasPendencias(texto)) return "pendencias-gerais"
  if (pedidoPrioridadesHoje(texto)) return "prioridades-hoje"
  if (/(como esta o escritorio|resumo do escritorio|escritorio hoje|situacao do escritorio|prioridades de hoje)/.test(texto)) return "escritorio"
  if (/(clientes?).*(atencao|prioridade|critico|pendenc)|precisam de atencao|precisa de atencao/.test(texto)) return "atencao"
  if (/certificad/.test(texto)) return "certificados"
  if (/procurac/.test(texto)) return "procuracoes"
  if (/(document|arquivo|anexo)/.test(texto)) return "documentos"
  if (/(financeir|honor|cobranc|receber|pagar|inadimpl|valor pendente|pagament|devendo|\bdeve\b|quanto deve|o que deve|ainda deve)/.test(texto)) return "financeiro"
  if (/(fiscal|obrig|das|imposto|tribut|vencimento)/.test(texto)) return "fiscal"
  if (/(clientes? ativos?|quantos clientes|lista de clientes|carteira de clientes)/.test(texto)) return "clientes"
  if (cliente && /(como esta|situacao|resumo|dados|regime|ramo|cnpj)/.test(texto)) return "cliente"
  return null
}

function nomesPermitidos(clientes) {
  return new Set(clientes.map((cliente) => normalizar(nomeCliente(cliente))))
}

function filtrarEscopo(itens, clientes, cliente) {
  const nomes = nomesPermitidos(clientes)
  return itens.filter((item) => nomes.has(normalizar(item.cliente)) && (!cliente || normalizar(item.cliente) === normalizar(nomeCliente(cliente))))
}

async function consultaClientes(clientes, texto) {
  const ativos = /ativ/.test(texto)
  const lista = ativos ? clientes.filter(clienteAtivo) : clientes
  const itens = lista.slice(0, 30).map((cliente) => ({
    id: cliente.id,
    clienteId: cliente.id,
    cliente: nomeCliente(cliente),
    titulo: nomeCliente(cliente),
    detalhe: `${cliente.regime || "Regime não informado"} • ${cliente.ramoAtividade || "Ramo não informado"}`,
    status: cliente.situacaoEmpresa || "Situação não informada",
  }))
  return respostaConsulta({
    resposta: `${ativos ? "A Nexa possui" : "Encontrei"} ${lista.length} cliente${lista.length === 1 ? "" : "s"}${ativos ? " ativo" + (lista.length === 1 ? "" : "s") : " cadastrado" + (lista.length === 1 ? "" : "s")}.`,
    consulta: {
      tipo: "clientes",
      titulo: ativos ? "Clientes ativos" : "Clientes cadastrados",
      resumo: `${lista.length} cliente${lista.length === 1 ? "" : "s"}.`,
      total: lista.length,
      itens,
      paginaSugerida: "Clientes",
      acaoSugerida: acaoPagina("Clientes"),
    },
  })
}

async function consultaFiscal(clientes, cliente, texto) {
  let itens = await Fiscal.findAll({ order: [["createdAt", "DESC"]], limit: 1000 })
  itens = filtrarEscopo(itens, clientes, cliente).filter((item) => !encerrado(item.status))
  if (/(das|simples nacional)/.test(texto)) itens = itens.filter((item) => /(das|simples)/.test(normalizar(item.obrigacao)))
  const filtro = periodo(texto)
  itens = ordenarData(filtrarPeriodo(itens, filtro, "vencimento"), "vencimento")
  const exibidos = itens.slice(0, 30).map((item) => {
    const dias = diasAte(item.vencimento)
    return {
      id: item.id,
      cliente: item.cliente,
      titulo: item.obrigacao || "Obrigação fiscal",
      detalhe: `Competência ${item.competencia || "não informada"}`,
      data: item.vencimento,
      dataFormatada: formatarData(item.vencimento),
      status: textoPrazo(dias),
      prazoDias: dias,
      valor: item.valor || null,
    }
  })
  const nome = cliente ? ` de ${nomeCliente(cliente)}` : ""
  const rotulo = filtro?.tipo === "vencidos" ? "vencidas" : filtro?.tipo === "hoje" ? "com vencimento hoje" : filtro?.rotulo || "pendentes"
  return respostaConsulta({
    resposta: itens.length ? `Encontrei ${itens.length} obrigação${itens.length === 1 ? "" : "ões"} fiscal${itens.length === 1 ? "" : "is"} ${rotulo}${nome}.` : `Não encontrei obrigações fiscais ${rotulo}${nome}.`,
    pontos: exibidos.slice(0, 8).map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`),
    recomendacao: itens.some((item) => (diasAte(item.vencimento) ?? 999) < 0) ? "Priorize as obrigações vencidas." : "Acompanhe os vencimentos mais próximos.",
    consulta: {
      tipo: "fiscal",
      titulo: cliente ? `Pendências fiscais — ${nomeCliente(cliente)}` : "Pendências fiscais",
      resumo: `${itens.length} obrigação${itens.length === 1 ? "" : "ões"} ${rotulo}.`,
      total: itens.length,
      itens: exibidos,
      paginaSugerida: "Fiscal",
      cliente: cliente ? { id: cliente.id, nome: nomeCliente(cliente) } : null,
      acaoSugerida: acaoPagina("Fiscal", cliente),
    },
  })
}

async function consultaFinanceiro(clientes, cliente, texto) {
  const [financeirosBanco, servicosBanco] = await Promise.all([
    Financeiro.findAll({ order: [["createdAt", "DESC"]], limit: 1200 }),
    ServicoAvulso.findAll({ order: [["createdAt", "DESC"]], limit: 1200 }),
  ])

  const nomes = nomesPermitidos(clientes)
  const ids = new Set(clientes.map((item) => Number(item.id)))
  const apenasReceber = /(receber|honor|cobranc|inadimpl|pagament|devendo|\bdeve\b|quanto deve|ainda deve)/.test(texto)
  const apenasPagar = /(pagar|despesa|contas a pagar)/.test(texto)

  let financeiros = financeirosBanco
    .filter((item) => nomes.has(normalizar(item.cliente)) && (!cliente || normalizar(item.cliente) === normalizar(nomeCliente(cliente))))
    .filter((item) => !encerrado(item.status))
    .filter((item) => !normalizar(item.origem).includes("servico"))

  if (apenasReceber) financeiros = financeiros.filter((item) => !/(despesa|pagar|saida)/.test(normalizar(item.tipo)))
  if (apenasPagar) financeiros = financeiros.filter((item) => /(despesa|pagar|saida)/.test(normalizar(item.tipo)))

  let servicos = servicosBanco
    .filter((item) => ids.has(Number(item.clienteId)) && (!cliente || Number(item.clienteId) === Number(cliente.id)))
    .filter((item) => !encerrado(item.status))
  if (apenasPagar) servicos = []

  const itens = [
    ...financeiros.map((item) => ({
      id: `financeiro-${item.id}`,
      cliente: item.cliente,
      titulo: item.descricao || item.tipo || "Lançamento financeiro",
      detalhe: item.tipo || "Tipo não informado",
      vencimento: item.vencimento,
      valorNumero: numeroMoeda(item.valor),
      statusOriginal: item.status,
      origem: item.origem || "Financeiro",
      pagina: "Financeiro",
    })),
    ...servicos.map((item) => ({
      id: `servico-${item.id}`,
      cliente: item.cliente,
      clienteId: item.clienteId,
      titulo: item.descricao || "Serviço do cliente",
      detalhe: `${Number(item.quantidade || 1)}x • Serviço e cobrança`,
      vencimento: item.vencimento,
      valorNumero: numeroMoeda(item.valorTotal),
      statusOriginal: item.status,
      origem: "Serviço do Cliente",
      pagina: "Clientes",
    })),
  ]

  const filtro = periodo(texto)
  const filtrados = ordenarData(filtrarPeriodo(itens, filtro, "vencimento"), "vencimento")
  const total = filtrados.reduce((soma, item) => soma + item.valorNumero, 0)
  const exibidos = filtrados.slice(0, 40).map((item) => ({
    id: item.id,
    cliente: item.cliente,
    clienteId: item.clienteId || null,
    titulo: item.titulo,
    detalhe: item.detalhe,
    data: item.vencimento,
    dataFormatada: formatarData(item.vencimento),
    status: item.vencimento ? textoPrazo(diasAte(item.vencimento)) : (item.statusOriginal || "Pendente"),
    valor: formatarMoeda(item.valorNumero),
    origem: item.origem,
    paginaSugerida: item.pagina,
  }))
  const nome = cliente ? ` de ${nomeCliente(cliente)}` : ""
  return respostaConsulta({
    resposta: filtrados.length ? `O financeiro${nome} possui ${filtrados.length} cobrança${filtrados.length === 1 ? "" : "s"} pendente${filtrados.length === 1 ? "" : "s"}, totalizando ${formatarMoeda(total)}.` : `Não encontrei cobranças financeiras pendentes${nome}.`,
    pontos: exibidos.slice(0, 10).map((item) => `${item.cliente}: ${item.titulo} — ${item.valor} — ${item.status}`),
    consulta: {
      tipo: "financeiro",
      titulo: cliente ? `Financeiro — ${nomeCliente(cliente)}` : "Financeiro pendente",
      resumo: `${filtrados.length} cobrança${filtrados.length === 1 ? "" : "s"} • ${formatarMoeda(total)}.`,
      total: filtrados.length,
      valorTotalFormatado: formatarMoeda(total),
      itens: exibidos,
      paginaSugerida: cliente && servicos.length ? "Clientes" : "Financeiro",
      cliente: cliente ? { id: cliente.id, nome: nomeCliente(cliente) } : null,
      acaoSugerida: acaoPagina(cliente && servicos.length ? "Clientes" : "Financeiro", cliente, cliente && servicos.length ? "central-cliente" : "pagina"),
    },
  })
}

async function consultaDocumentos(clientes, cliente, texto) {
  let itens = await DocumentoDigital.findAll({ order: [["createdAt", "DESC"]], limit: 500 })
  itens = filtrarEscopo(itens, clientes, cliente)
  if (/penden|aguard/.test(texto)) itens = itens.filter((item) => !encerrado(item.status))
  if (/recent|ultim/.test(texto)) itens = itens.slice(0, 30)
  const exibidos = itens.slice(0, 30).map((item) => ({
    id: item.id,
    cliente: item.cliente,
    titulo: item.tipo || "Documento",
    detalhe: `${item.origem || "Origem não informada"} • Ano ${item.anoCalendario || "não informado"}`,
    data: item.dataEnvio || item.createdAt,
    dataFormatada: formatarData(item.dataEnvio || item.createdAt),
    status: item.status || "Status não informado",
  }))
  const nome = cliente ? ` de ${nomeCliente(cliente)}` : ""
  return respostaConsulta({
    resposta: itens.length ? `Encontrei ${itens.length} documento${itens.length === 1 ? "" : "s"}${nome}.` : `Não encontrei documentos${nome} com os filtros solicitados.`,
    pontos: exibidos.slice(0, 8).map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`),
    consulta: {
      tipo: "documentos",
      titulo: cliente ? `Documentos — ${nomeCliente(cliente)}` : "Documentos digitais",
      resumo: `${itens.length} documento${itens.length === 1 ? "" : "s"}.`,
      total: itens.length,
      itens: exibidos,
      paginaSugerida: "Documentos Digitais",
      cliente: cliente ? { id: cliente.id, nome: nomeCliente(cliente) } : null,
      acaoSugerida: acaoPagina("Documentos Digitais", cliente),
    },
  })
}

async function consultaValidades(clientes, cliente, texto, tipo) {
  const ids = new Set(clientes.map((item) => Number(item.id)))
  const Modelo = tipo === "certificados" ? CertificadoDigital : ProcuracaoEcac
  let itens = await Modelo.findAll({ order: [["dataValidade", "ASC"]], limit: 500 })
  itens = itens.filter((item) => ids.has(Number(item.clienteId)))
  if (cliente) itens = itens.filter((item) => Number(item.clienteId) === Number(cliente.id))
  itens = itens.filter((item) => tipo === "certificados" ? item.ativo !== false : item.ativa !== false)
  const filtro = periodo(texto, { tipo: "faixa", min: -36500, max: 30, rotulo: "vencidos ou vencendo em até 30 dias" })
  itens = ordenarData(filtrarPeriodo(itens, filtro, "dataValidade"), "dataValidade")
  const porId = new Map(clientes.map((item) => [Number(item.id), nomeCliente(item)]))
  const pagina = tipo === "certificados" ? "Certificados Digitais" : "Procurações e-CAC"
  const exibidos = itens.slice(0, 30).map((item) => ({
    id: item.id,
    clienteId: item.clienteId,
    cliente: item.cliente || porId.get(Number(item.clienteId)) || "Cliente",
    titulo: tipo === "certificados" ? `${item.tipo || "Certificado"} digital` : (item.tipo || "Procuração e-CAC"),
    detalhe: tipo === "certificados" ? (item.autoridadeCertificadora || "Autoridade não informada") : (item.servicosAutorizados || "Serviços não informados"),
    data: item.dataValidade,
    dataFormatada: formatarData(item.dataValidade),
    status: textoPrazo(diasAte(item.dataValidade)),
  }))
  const nome = cliente ? ` de ${nomeCliente(cliente)}` : ""
  return respostaConsulta({
    resposta: itens.length ? `Encontrei ${itens.length} registro${itens.length === 1 ? "" : "s"}${nome} no período consultado.` : `Não encontrei registros${nome} no período consultado.`,
    pontos: exibidos.slice(0, 8).map((item) => `${item.cliente}: ${item.status} (${item.dataFormatada})`),
    recomendacao: itens.some((item) => (diasAte(item.dataValidade) ?? 999) < 0) ? "Regularize primeiro os registros vencidos." : "Planeje a renovação antes do vencimento.",
    consulta: {
      tipo,
      titulo: cliente ? `${pagina} — ${nomeCliente(cliente)}` : pagina,
      resumo: `${itens.length} registro${itens.length === 1 ? "" : "s"}.`,
      total: itens.length,
      itens: exibidos,
      paginaSugerida: pagina,
      cliente: cliente ? { id: cliente.id, nome: nomeCliente(cliente) } : null,
      acaoSugerida: acaoPagina(pagina, cliente),
    },
  })
}

async function consultaCliente(cliente) {
  if (!cliente) {
    return respostaConsulta({
      resposta: "Qual cliente você quer consultar? Selecione-o no campo de contexto ou informe o nome na pergunta.",
      consulta: { tipo: "cliente-nao-informado", titulo: "Selecione um cliente", resumo: "A consulta precisa de um cliente específico.", total: 0, itens: [] },
    })
  }
  const nome = nomeCliente(cliente)
  const [fiscais, financeiros, documentos, certificados, procuracoes] = await Promise.all([
    Fiscal.findAll({ where: { cliente: nome }, order: [["createdAt", "DESC"]], limit: 300 }),
    Financeiro.findAll({ where: { cliente: nome }, order: [["createdAt", "DESC"]], limit: 300 }),
    DocumentoDigital.findAll({ where: { cliente: nome }, order: [["createdAt", "DESC"]], limit: 100 }),
    CertificadoDigital.findAll({ where: { clienteId: cliente.id, ativo: true }, limit: 20 }),
    ProcuracaoEcac.findAll({ where: { clienteId: cliente.id, ativa: true }, limit: 20 }),
  ])
  const fiscaisAbertos = fiscais.filter((item) => !encerrado(item.status))
  const financeirosAbertos = financeiros.filter((item) => !encerrado(item.status))
  const vencidos = fiscaisAbertos.filter((item) => (diasAte(item.vencimento) ?? 999) < 0).length
  const totalFinanceiro = financeirosAbertos.reduce((total, item) => total + numeroMoeda(item.valor), 0)
  const itens = [
    { titulo: "Regime tributário", detalhe: cliente.regime || "Não informado", status: cliente.situacaoEmpresa || "Situação não informada" },
    { titulo: "Ramo de atividade", detalhe: cliente.ramoAtividade || "Não informado", status: cliente.cidade ? `${cliente.cidade}/${cliente.estado || ""}` : "Local não informado" },
    { titulo: "Pendências fiscais", detalhe: `${fiscaisAbertos.length} aberta${fiscaisAbertos.length === 1 ? "" : "s"}`, status: vencidos ? `${vencidos} vencida${vencidos === 1 ? "" : "s"}` : "Sem vencidas" },
    { titulo: "Financeiro pendente", detalhe: `${financeirosAbertos.length} lançamento${financeirosAbertos.length === 1 ? "" : "s"}`, status: formatarMoeda(totalFinanceiro) },
    { titulo: "Documentos", detalhe: `${documentos.length} registro${documentos.length === 1 ? "" : "s"}`, status: documentos[0] ? `Último: ${formatarData(documentos[0].dataEnvio || documentos[0].createdAt)}` : "Nenhum" },
    { titulo: "Identidade digital", detalhe: `${certificados.length} certificado${certificados.length === 1 ? "" : "s"} • ${procuracoes.length} procuração${procuracoes.length === 1 ? "" : "ões"}`, status: "Ativos" },
  ]
  return respostaConsulta({
    resposta: fiscaisAbertos.length === 1
      ? `${nome} está cadastrado como ${cliente.regime || "regime não informado"} e possui 1 pendência fiscal aberta.`
      : `${nome} está cadastrado como ${cliente.regime || "regime não informado"} e possui ${fiscaisAbertos.length} pendências fiscais abertas.`,
    pontos: itens.map((item) => `${item.titulo}: ${item.detalhe} — ${item.status}`),
    consulta: {
      tipo: "cliente-resumo",
      titulo: `Resumo de ${nome}`,
      resumo: `${cliente.regime || "Regime não informado"} • ${cliente.situacaoEmpresa || "Situação não informada"}`,
      total: itens.length,
      itens,
      paginaSugerida: "Clientes",
      cliente: { id: cliente.id, nome },
      acaoSugerida: acaoPagina("Clientes", cliente, "central-cliente"),
    },
  })
}

function documentoRecebidoDoCliente(item) {
  const origem = normalizar(item?.origem).replace(/\s+/g, " ")
  const status = normalizar(item?.status).replace(/\s+/g, " ")
  const texto = `${origem} ${status}`

  // O que o escritório enviou ao cliente já é trabalho concluído do nosso lado.
  if (/(escritorio\s*(?:→|->|para|ao)\s*cliente|disponivel para baixar|enviado ao cliente|entregue ao cliente|aguardando download|aguardando o cliente)/.test(texto)) {
    return false
  }

  return /(cliente\s*(?:→|->|para|ao)\s*escritorio|entregue pelo cliente|enviado pelo cliente|recebido do cliente|origem cliente)/.test(texto)
}

function documentoExigeAtencao(item) {
  const status = normalizar(item?.status)
  if (!documentoRecebidoDoCliente(item)) return false
  if (documentoConcluido(status)) return false
  if (/(cancelad|arquivad|rejeitad)/.test(status)) return false
  return true
}

function fiscalAbertoParaPrioridade(item) {
  const status = normalizar(item?.status)
  return !encerrado(status) && !/(pago pelo escritorio|pago pelo escritório)/.test(status)
}

function prioridadePorPrazo(dias, { vencido = 110, hoje = 100, futuro = 80, semData = 65 } = {}) {
  if (dias === null) return semData
  if (dias < 0) return vencido + Math.min(Math.abs(dias), 20)
  if (dias === 0) return hoje
  return Math.max(35, futuro - Math.min(dias, 45))
}

function tipoFinanceiroRecebivel(item) {
  const texto = `${normalizar(item?.tipo)} ${normalizar(item?.descricao)} ${normalizar(item?.origem)}`
  return !/(despesa|saida|conta a pagar)/.test(texto)
}

function origemEhServico(item) {
  const texto = `${normalizar(item?.origem)} ${normalizar(item?.referenciaOrigem)}`
  return texto.includes("servico")
}

async function carregarPendenciasOperacionais(clientes, cliente = null) {
  const permitidos = clientes.filter(clienteAtivo)
  const nomes = nomesPermitidos(permitidos)
  const ids = new Set(permitidos.map((item) => Number(item.id)))
  const porId = new Map(permitidos.map((item) => [Number(item.id), item]))
  const porNome = new Map(permitidos.map((item) => [normalizar(nomeCliente(item)), item]))
  const clienteEscolhidoId = cliente ? Number(cliente.id) : null
  const clienteEscolhidoNome = cliente ? normalizar(nomeCliente(cliente)) : null

  // Usa as mesmas fontes operacionais do Assistente do Dia. MovimentoCliente não
  // entra aqui: ele é histórico financeiro/contábil e não representa, por si só,
  // uma ação pendente do escritório.
  const [fiscais, financeiros, servicos, documentos, solicitacoes] = await Promise.all([
    Fiscal.findAll({ order: [["createdAt", "DESC"]], limit: 2500 }),
    Financeiro.findAll({ order: [["createdAt", "DESC"]], limit: 2500 }),
    ServicoAvulso.findAll({ order: [["createdAt", "DESC"]], limit: 2500 }),
    DocumentoDigital.findAll({ order: [["createdAt", "DESC"]], limit: 1800 }),
    SolicitacaoCliente.findAll({ order: [["createdAt", "DESC"]], limit: 1800 }),
  ])

  const itens = []
  const chavesAdicionadas = new Set()
  const chavesSemanticas = new Set()
  const resolverCadastro = (clienteId, clienteNome) => {
    const porCodigo = Number(clienteId) > 0 ? porId.get(Number(clienteId)) : null
    return porCodigo || porNome.get(normalizar(clienteNome)) || null
  }
  const registroPermitido = (clienteId, clienteNome) => {
    if (Number(clienteId) > 0 && ids.has(Number(clienteId))) return true
    return nomes.has(normalizar(clienteNome))
  }
  const adicionar = ({ modulo, categoria, clienteNome, clienteId = null, titulo, detalhe = "", status = "Pendente", data = null, valor = null, prioridade = 60, pagina = "Clientes", referenciaId = null }) => {
    const cadastro = resolverCadastro(clienteId, clienteNome)
    const idResolvido = Number(clienteId || cadastro?.id || 0) || null
    const nomeResolvido = cadastro ? nomeCliente(cadastro) : (clienteNome || "Cliente")
    if (clienteEscolhidoId && idResolvido && idResolvido !== clienteEscolhidoId) return
    if (clienteEscolhidoNome && !idResolvido && normalizar(nomeResolvido) !== clienteEscolhidoNome) return
    const chave = `${modulo}:${referenciaId || "sem-id"}:${idResolvido || normalizar(nomeResolvido)}`
    const chaveSemantica = [
      idResolvido || normalizar(nomeResolvido),
      normalizar(titulo),
      String(data || "").slice(0, 10),
      valor === null || valor === undefined ? "" : numeroMoeda(valor).toFixed(2),
    ].join("|")
    if (chavesAdicionadas.has(chave) || chavesSemanticas.has(chaveSemantica)) return
    chavesAdicionadas.add(chave)
    chavesSemanticas.add(chaveSemantica)
    const valorNumero = valor === null || valor === undefined ? 0 : numeroMoeda(valor)
    itens.push({
      id: `${modulo}-${referenciaId || itens.length + 1}`,
      referenciaId,
      cliente: nomeResolvido,
      clienteId: idResolvido,
      titulo,
      detalhe,
      status,
      data,
      dataFormatada: data ? formatarData(data) : "Sem data definida",
      valor: valorNumero > 0 ? formatarMoeda(valorNumero) : "",
      valorNumero,
      prioridade,
      modulo,
      categoria,
      paginaSugerida: pagina,
    })
  }

  deduplicarFiscaisAbertos(
    fiscais.filter((item) => nomes.has(normalizar(item.cliente)) && fiscalAbertoParaPrioridade(item))
  )
    .forEach((item) => {
      const dias = diasAte(item.vencimento)
      adicionar({
        modulo: "fiscal",
        categoria: "Fiscal",
        clienteNome: item.cliente,
        titulo: item.obrigacao || "Obrigação fiscal",
        detalhe: `Competência ${item.competencia || "não informada"}${item.observacao ? ` • ${item.observacao}` : ""}`,
        status: item.vencimento ? textoPrazo(dias) : (item.status || "Pendente"),
        data: item.vencimento,
        valor: item.valor,
        prioridade: prioridadePorPrazo(dias, { vencido: 140, hoje: 134, futuro: 106, semData: 84 }),
        pagina: "Fiscal",
        referenciaId: item.id,
      })
    })

  solicitacoes
    .filter((item) => nomes.has(normalizar(item.cliente)) && solicitacaoAbertaParaPrioridade(item))
    .forEach((item) => {
      const dias = diasAte(item.vencimento || item.prazo)
      adicionar({
        modulo: "solicitacao-cliente",
        categoria: "Atendimento",
        clienteNome: item.cliente,
        clienteId: item.clienteId,
        titulo: item.titulo || item.categoria || "Solicitação do cliente",
        detalhe: item.descricao || item.mensagem || "Solicitação aguardando ação do escritório",
        status: item.status || "Pendente",
        data: item.vencimento || item.prazo || item.createdAt,
        prioridade: prioridadePorPrazo(dias, { vencido: 126, hoje: 116, futuro: 88, semData: 82 }),
        pagina: "Pendências Clientes",
        referenciaId: item.id,
      })
    })

  documentos
    .filter((item) => nomes.has(normalizar(item.cliente)) && documentoExigeAtencao(item))
    .forEach((item) => {
      adicionar({
        modulo: "documento-recebido",
        categoria: "Documento recebido",
        clienteNome: item.cliente,
        titulo: item.tipo || "Documento recebido do cliente",
        detalhe: item.observacao || "Arquivo recebido e aguardando análise do escritório",
        status: item.status || "Aguardando análise",
        data: item.dataEnvio || item.createdAt,
        prioridade: 110,
        pagina: "Documentos Digitais",
        referenciaId: item.id,
      })
    })

  servicos
    .filter((item) => registroPermitido(item.clienteId, item.cliente) && servicoAbertoParaPrioridade(item))
    .forEach((item) => {
      const dias = diasAte(item.vencimento)
      adicionar({
        modulo: "servico-cobranca",
        categoria: "Financeiro do escritório",
        clienteNome: item.cliente,
        clienteId: item.clienteId,
        titulo: item.descricao || "Serviço realizado",
        detalhe: `${Number(item.quantidade || 1)}x • Serviço e cobrança`,
        status: item.vencimento ? textoPrazo(dias) : (item.status || "Pendente"),
        data: item.vencimento,
        valor: item.valorTotal,
        prioridade: prioridadePorPrazo(dias, { vencido: 118, hoje: 108, futuro: 84, semData: 74 }),
        pagina: "Clientes",
        referenciaId: item.id,
      })
    })

  financeiros
    .filter((item) => registroPermitido(item.clienteId, item.cliente)
      && financeiroDoEscritorioParaPrioridade(item)
      && tipoFinanceiroRecebivel(item)
    )
    .forEach((item) => {
      const dias = diasAte(item.vencimento)
      const ehHonorario = /honor/.test(`${normalizar(item.descricao)} ${normalizar(item.origem)} ${normalizar(item.centroCusto)}`)
      const ehServico = origemEhServico(item)
      adicionar({
        // O financeiro sincronizado funciona como fallback quando o registro de
        // ServiçoAvulso não for recuperado. A chave semântica acima impede que o
        // mesmo serviço apareça duas vezes quando as duas fontes estiverem presentes.
        modulo: ehServico ? "servico-cobranca" : (ehHonorario ? "honorario" : "financeiro"),
        categoria: ehHonorario ? "Honorário" : "Financeiro do escritório",
        clienteNome: item.cliente,
        clienteId: item.clienteId,
        titulo: item.descricao || item.tipo || (ehHonorario ? "Honorário" : "Cobrança financeira"),
        detalhe: item.origem || item.centroCusto || item.tipo || "Financeiro do escritório",
        status: item.vencimento ? textoPrazo(dias) : (item.status || "Pendente"),
        data: item.vencimento,
        valor: item.valor,
        prioridade: prioridadePorPrazo(dias, { vencido: ehHonorario ? 120 : 116, hoje: ehHonorario ? 110 : 106, futuro: 82, semData: 72 }),
        pagina: ehServico ? "Clientes" : "Financeiro",
        referenciaId: item.id,
      })
    })

  return itens.sort((a, b) => b.prioridade - a.prioridade || String(a.data || "9999").localeCompare(String(b.data || "9999")) || a.cliente.localeCompare(b.cliente))
}

async function carregarNovidadesHoje(clientes, cliente = null) {
  const permitidos = clientes.filter(clienteAtivo)
  const nomes = nomesPermitidos(permitidos)
  const ids = new Set(permitidos.map((item) => Number(item.id)))
  const porId = new Map(permitidos.map((item) => [Number(item.id), item]))
  const clienteId = cliente ? Number(cliente.id) : null
  const clienteNome = cliente ? normalizar(nomeCliente(cliente)) : null
  const [servicos, financeiros, fiscais, solicitacoes, documentos] = await Promise.all([
    ServicoAvulso.findAll({ order: [["updatedAt", "DESC"]], limit: 1000 }),
    Financeiro.findAll({ order: [["updatedAt", "DESC"]], limit: 1000 }),
    Fiscal.findAll({ order: [["updatedAt", "DESC"]], limit: 1000 }),
    SolicitacaoCliente.findAll({ order: [["updatedAt", "DESC"]], limit: 1000 }),
    DocumentoDigital.findAll({ order: [["updatedAt", "DESC"]], limit: 1000 }),
  ])
  const novidades = []
  const adicionar = (item) => {
    if (clienteId && item.clienteId && Number(item.clienteId) !== clienteId) return
    if (clienteNome && !item.clienteId && normalizar(item.cliente) !== clienteNome) return
    novidades.push(item)
  }

  servicos
    .filter((item) => ids.has(Number(item.clienteId)) && recebido(item.status) && dataEhHoje(item.dataRecebimento || item.updatedAt))
    .forEach((item) => adicionar({
      id: `pagamento-servico-${item.id}`,
      tipoNovidade: "pagamento",
      clienteId: item.clienteId,
      cliente: item.cliente || nomeCliente(porId.get(Number(item.clienteId))),
      titulo: item.descricao || "Serviço do cliente",
      detalhe: `${Number(item.quantidade || 1)}x • ${item.formaPagamento || "Forma não informada"}`,
      status: "Recebido hoje",
      data: item.dataRecebimento || item.updatedAt,
      dataFormatada: formatarData(item.dataRecebimento || item.updatedAt),
      valor: formatarMoeda(numeroMoeda(item.valorTotal)),
      valorNumero: numeroMoeda(item.valorTotal),
      paginaSugerida: "Clientes",
    }))

  financeiros
    .filter((item) => nomes.has(normalizar(item.cliente)) && recebido(item.status) && dataEhHoje(item.dataRecebimento || item.updatedAt) && !origemEhServico(item))
    .forEach((item) => adicionar({
      id: `pagamento-financeiro-${item.id}`,
      tipoNovidade: "pagamento",
      clienteId: item.clienteId,
      cliente: item.cliente,
      titulo: item.descricao || "Recebimento",
      detalhe: item.formaPagamento || item.origem || "Financeiro",
      status: "Recebido hoje",
      data: item.dataRecebimento || item.updatedAt,
      dataFormatada: formatarData(item.dataRecebimento || item.updatedAt),
      valor: formatarMoeda(numeroMoeda(item.valor)),
      valorNumero: numeroMoeda(item.valor),
      paginaSugerida: "Financeiro",
    }))

  fiscais
    .filter((item) => nomes.has(normalizar(item.cliente)) && concluido(item.status) && dataEhHoje(item.updatedAt))
    .forEach((item) => adicionar({
      id: `resolvida-fiscal-${item.id}`,
      tipoNovidade: "resolvida",
      cliente: item.cliente,
      titulo: item.obrigacao || "Obrigação fiscal",
      detalhe: `Competência ${item.competencia || "não informada"}`,
      status: item.status || "Concluído hoje",
      data: item.updatedAt,
      dataFormatada: formatarData(item.updatedAt),
      valor: item.valor && numeroMoeda(item.valor) > 0 ? formatarMoeda(numeroMoeda(item.valor)) : "",
      paginaSugerida: "Fiscal",
    }))

  solicitacoes
    .filter((item) => nomes.has(normalizar(item.cliente)) && concluido(item.status) && dataEhHoje(item.updatedAt))
    .forEach((item) => adicionar({
      id: `resolvida-solicitacao-${item.id}`,
      tipoNovidade: "resolvida",
      cliente: item.cliente,
      titulo: item.titulo || "Solicitação do cliente",
      detalhe: item.respostaCliente || item.categoria || "Solicitação atendida",
      status: item.status || "Concluída hoje",
      data: item.updatedAt,
      dataFormatada: formatarData(item.updatedAt),
      valor: "",
      paginaSugerida: "Pendências Clientes",
    }))

  documentos
    .filter((item) => nomes.has(normalizar(item.cliente)) && documentoConcluido(item.status) && dataEhHoje(item.updatedAt))
    .forEach((item) => adicionar({
      id: `resolvida-documento-${item.id}`,
      tipoNovidade: "resolvida",
      cliente: item.cliente,
      titulo: item.tipo || "Documento",
      detalhe: item.observacao || item.origem || "Documento tratado",
      status: item.status || "Concluído hoje",
      data: item.updatedAt,
      dataFormatada: formatarData(item.updatedAt),
      valor: "",
      paginaSugerida: "Documentos Digitais",
    }))

  return novidades.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0))
}

function agruparPendenciasPorCliente(itens) {
  const mapa = new Map()
  for (const item of itens) {
    const chave = item.clienteId ? `id-${item.clienteId}` : `nome-${normalizar(item.cliente)}`
    if (!mapa.has(chave)) mapa.set(chave, { cliente: item.cliente, clienteId: item.clienteId || null, itens: [], prioridade: 0, valorNumero: 0 })
    const grupo = mapa.get(chave)
    grupo.itens.push(item)
    grupo.prioridade = Math.max(grupo.prioridade, item.prioridade || 0)
    grupo.valorNumero += Number(item.valorNumero || 0)
  }

  return [...mapa.values()]
    .sort((a, b) => b.prioridade - a.prioridade || a.cliente.localeCompare(b.cliente))
    .map((grupo, indice) => {
      const detalhes = grupo.itens.slice(0, 6).map((item) => {
        const valor = item.valor ? `, ${item.valor}` : ""
        const data = item.data ? `, ${item.status.toLowerCase()}` : ""
        return `${item.titulo}${valor}${data}`
      })
      const extras = grupo.itens.length - detalhes.length
      return {
        id: `cliente-pendencias-${grupo.clienteId || indice}`,
        clienteId: grupo.clienteId,
        cliente: grupo.cliente,
        titulo: `${grupo.itens.length} ${grupo.itens.length === 1 ? "pendência" : "pendências"}`,
        detalhe: `${detalhes.join(" • ")}${extras > 0 ? ` • mais ${extras}` : ""}`,
        status: grupo.itens[0]?.status || "Pendente",
        data: grupo.itens[0]?.data || null,
        dataFormatada: grupo.itens[0]?.dataFormatada || "Sem data definida",
        valor: grupo.valorNumero > 0 ? formatarMoeda(grupo.valorNumero) : "",
        prioridade: grupo.prioridade,
        paginaSugerida: grupo.itens[0]?.paginaSugerida || "Clientes",
      }
    })
}

function fraseListaPrioridades(itens, novidades = []) {
  if (!itens.length && !novidades.length) {
    return "Hoje não encontrei pendências abertas nem novidades registradas no escritório."
  }

  const grupos = agruparPendenciasPorCliente(itens)
  const principais = grupos.slice(0, 20).map((grupo) => `${grupo.cliente}: ${grupo.detalhe}`)
  const gruposExtras = Math.max(0, grupos.length - principais.length)
  const recebimentos = novidades.filter((item) => item.tipoNovidade === "pagamento")
    .slice(0, 4)
    .map((item) => `${item.cliente} pagou ${item.valor || "um valor"} referente a ${item.titulo}`)
  const resolvidas = novidades.filter((item) => item.tipoNovidade === "resolvida")
    .slice(0, 3)
    .map((item) => `${item.cliente} teve ${item.titulo} concluído`)

  const blocos = []
  if (principais.length) blocos.push(`Prioridades abertas: ${principais.join("; ")}${gruposExtras ? `; e mais ${gruposExtras} cliente${gruposExtras === 1 ? "" : "s"}` : ""}.`)
  if (recebimentos.length) blocos.push(`Pagamentos recebidos hoje: ${recebimentos.join("; ")}.`)
  if (resolvidas.length) blocos.push(`Pendências resolvidas hoje: ${resolvidas.join("; ")}.`)
  if (itens.length) blocos.push(`A prioridade principal é ${itens[0].cliente}: ${itens[0].titulo}, porque ${String(itens[0].status || "exige atenção").toLowerCase()}.`)
  return blocos.join(" ")
}

async function consultaPrioridadesHoje(clientes, cliente = null) {
  const [pendencias, novidades] = await Promise.all([
    carregarPendenciasOperacionais(clientes, cliente),
    carregarNovidadesHoje(clientes, cliente),
  ])
  const resposta = fraseListaPrioridades(pendencias, novidades)
  const exibidos = pendencias.slice(0, 50)
  return respostaConsulta({
    resposta,
    fala: resposta,
    pontos: exibidos.slice(0, 12).map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`),
    recomendacao: pendencias.length ? `Comece por ${pendencias[0].cliente}: ${pendencias[0].titulo}.` : "Não há prioridade aberta agora.",
    consulta: {
      tipo: "prioridades-hoje",
      titulo: "Prioridades e novidades de hoje",
      resumo: `${pendencias.length} pendência${pendencias.length === 1 ? "" : "s"} aberta${pendencias.length === 1 ? "" : "s"} • ${novidades.length} novidade${novidades.length === 1 ? "" : "s"} hoje.`,
      total: pendencias.length,
      itens: exibidos,
      novidades: novidades.slice(0, 30),
      prioridadePrincipal: exibidos[0] || null,
      paginaSugerida: "Assistente do Dia",
      acaoSugerida: acaoPagina("Assistente do Dia"),
    },
  })
}

async function consultaPendenciasGerais(clientes, cliente = null) {
  const pendencias = await carregarPendenciasOperacionais(clientes, cliente)
  const grupos = agruparPendenciasPorCliente(pendencias)
  const partes = grupos.map((grupo) => `${grupo.cliente}: ${grupo.detalhe}`)
  const resposta = grupos.length
    ? `Encontrei ${pendencias.length} pendência${pendencias.length === 1 ? "" : "s"} em ${grupos.length} cliente${grupos.length === 1 ? "" : "s"}. ${partes.join("; ")}. A prioridade é ${pendencias[0].cliente}: ${pendencias[0].titulo}, ${String(pendencias[0].status || "exige atenção").toLowerCase()}.`
    : "Não encontrei pendências abertas nos clientes do escritório."
  return respostaConsulta({
    resposta,
    fala: resposta,
    pontos: grupos.slice(0, 15).map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`),
    recomendacao: pendencias.length ? `Trate primeiro ${pendencias[0].cliente}: ${pendencias[0].titulo}.` : "Nenhuma ação pendente.",
    consulta: {
      tipo: "pendencias-gerais",
      titulo: cliente ? `Todas as pendências — ${nomeCliente(cliente)}` : "Todas as pendências dos clientes",
      resumo: `${pendencias.length} pendência${pendencias.length === 1 ? "" : "s"} em ${grupos.length} cliente${grupos.length === 1 ? "" : "s"}.`,
      total: pendencias.length,
      clientesComPendencias: grupos.length,
      itens: grupos.slice(0, 60),
      prioridadePrincipal: pendencias[0] || null,
      paginaSugerida: "Assistente do Dia",
      acaoSugerida: acaoPagina("Assistente do Dia"),
    },
  })
}

async function consultaPagamentosHoje(clientes, cliente = null) {
  const novidades = (await carregarNovidadesHoje(clientes, cliente)).filter((item) => item.tipoNovidade === "pagamento")
  const total = novidades.reduce((soma, item) => soma + Number(item.valorNumero || 0), 0)
  const resposta = novidades.length
    ? `Hoje ${novidades.length} pagamento${novidades.length === 1 ? " foi recebido" : "s foram recebidos"}, totalizando ${formatarMoeda(total)}. ${novidades.map((item) => `${item.cliente} pagou ${item.valor} referente a ${item.titulo}`).join("; ")}.`
    : "Nenhum pagamento de cliente foi registrado hoje."
  return respostaConsulta({
    resposta,
    fala: resposta,
    pontos: novidades.map((item) => `${item.cliente}: ${item.valor} — ${item.titulo}`),
    consulta: {
      tipo: "pagamentos-hoje",
      titulo: "Pagamentos recebidos hoje",
      resumo: `${novidades.length} pagamento${novidades.length === 1 ? "" : "s"} • ${formatarMoeda(total)}.`,
      total: novidades.length,
      valorTotalFormatado: formatarMoeda(total),
      itens: novidades,
      paginaSugerida: "Financeiro",
      acaoSugerida: acaoPagina("Financeiro"),
    },
  })
}

async function consultaResolvidasHoje(clientes, cliente = null) {
  const novidades = await carregarNovidadesHoje(clientes, cliente)
  const resposta = novidades.length
    ? `Hoje houve ${novidades.length} ${novidades.length === 1 ? "atualização" : "atualizações"}: ${novidades.map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`).join("; ")}.`
    : "Nenhum pagamento ou encerramento de pendência foi registrado hoje."
  return respostaConsulta({
    resposta,
    fala: resposta,
    pontos: novidades.map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`),
    consulta: {
      tipo: "resolvidas-hoje",
      titulo: "Pagamentos e pendências resolvidas hoje",
      resumo: `${novidades.length} ${novidades.length === 1 ? "atualização" : "atualizações"}.`,
      total: novidades.length,
      itens: novidades,
      paginaSugerida: "Assistente do Dia",
      acaoSugerida: acaoPagina("Assistente do Dia"),
    },
  })
}

async function consultaMensagensPendentes(clientes, cliente = null) {
  const nomes = nomesPermitidos(clientes.filter(clienteAtivo))
  let itens = await SolicitacaoCliente.findAll({ order: [["createdAt", "DESC"]], limit: 1000 })
  itens = itens.filter((item) => nomes.has(normalizar(item.cliente)) && solicitacaoAberta(item))
  if (cliente) itens = itens.filter((item) => normalizar(item.cliente) === normalizar(nomeCliente(cliente)))
  const exibidos = itens.map((item) => ({
    id: item.id,
    cliente: item.cliente,
    titulo: item.titulo || "Solicitação do cliente",
    detalhe: item.mensagem || item.categoria || "Pedido de ajuda",
    status: item.novaInteracao ? "Nova interação" : (item.status || "Pendente"),
    data: item.createdAt,
    dataFormatada: formatarData(item.createdAt),
    paginaSugerida: "Pendências Clientes",
  }))
  const resposta = exibidos.length
    ? `Há ${exibidos.length} mensagem${exibidos.length === 1 ? "" : "s"} ou pedido${exibidos.length === 1 ? "" : "s"} de ajuda pendente${exibidos.length === 1 ? "" : "s"}: ${exibidos.map((item) => `${item.cliente}: ${item.titulo} — ${item.detalhe}`).join("; ")}.`
    : "Não há mensagens ou pedidos de ajuda pendentes registrados no sistema."
  return respostaConsulta({
    resposta,
    fala: resposta,
    pontos: exibidos.map((item) => `${item.cliente}: ${item.titulo}`),
    consulta: {
      tipo: "mensagens-pendentes",
      titulo: "Mensagens e pedidos de ajuda",
      resumo: `${exibidos.length} item${exibidos.length === 1 ? "" : "s"} pendente${exibidos.length === 1 ? "" : "s"}.`,
      total: exibidos.length,
      itens: exibidos,
      paginaSugerida: "Pendências Clientes",
      acaoSugerida: acaoPagina("Pendências Clientes", cliente),
    },
  })
}

async function consultaDocumentosPendentes(clientes, cliente = null) {
  let itens = await DocumentoDigital.findAll({ order: [["createdAt", "DESC"]], limit: 1000 })
  itens = filtrarEscopo(itens, clientes.filter(clienteAtivo), cliente).filter(documentoExigeAtencao)
  const exibidos = itens.map((item) => ({
    id: item.id,
    cliente: item.cliente,
    titulo: item.tipo || "Documento",
    detalhe: item.observacao || "Documento recebido do cliente e aguardando análise",
    status: item.status || "Aguardando análise",
    data: item.dataEnvio || item.createdAt,
    dataFormatada: formatarData(item.dataEnvio || item.createdAt),
    paginaSugerida: "Documentos Digitais",
  }))
  const resposta = exibidos.length
    ? `Há ${exibidos.length} documento${exibidos.length === 1 ? "" : "s"} recebido${exibidos.length === 1 ? "" : "s"} de clientes aguardando análise: ${exibidos.map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`).join("; ")}.`
    : "Não há documentos recebidos de clientes aguardando análise no escritório."
  return respostaConsulta({
    resposta,
    fala: resposta,
    pontos: exibidos.map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`),
    consulta: {
      tipo: "documentos-pendentes",
      titulo: "Documentos recebidos aguardando análise",
      resumo: `${exibidos.length} documento${exibidos.length === 1 ? "" : "s"} recebido${exibidos.length === 1 ? "" : "s"} de clientes.`,
      total: exibidos.length,
      itens: exibidos,
      paginaSugerida: "Documentos Digitais",
      acaoSugerida: acaoPagina("Documentos Digitais", cliente),
    },
  })
}

async function consultaAtencao(clientes) {
  const pendencias = await carregarPendenciasOperacionais(clientes)
  const grupos = agruparPendenciasPorCliente(pendencias).map((item) => ({
    ...item,
    status: item.prioridade >= 120 ? "Prioridade alta" : item.prioridade >= 100 ? "Prioridade média" : "Atenção preventiva",
  }))
  const resposta = grupos.length
    ? `${grupos.length} cliente${grupos.length === 1 ? " precisa" : "s precisam"} de atenção. ${grupos.map((item) => `${item.cliente}: ${item.detalhe}`).join("; ")}. A prioridade principal é ${pendencias[0].cliente}: ${pendencias[0].titulo}.`
    : "Nenhum cliente apresenta pendência aberta ou alerta operacional agora."
  return respostaConsulta({
    resposta,
    pontos: grupos.slice(0, 15).map((item) => `${item.cliente}: ${item.status} — ${item.detalhe}`),
    recomendacao: pendencias.length ? `Comece por ${pendencias[0].cliente}: ${pendencias[0].titulo}.` : "Mantenha o acompanhamento preventivo.",
    consulta: {
      tipo: "clientes-atencao",
      titulo: "Clientes que precisam de atenção",
      resumo: `${grupos.length} cliente${grupos.length === 1 ? "" : "s"} com pendências em qualquer área.`,
      total: grupos.length,
      itens: grupos.slice(0, 60),
      prioridadePrincipal: pendencias[0] || null,
      paginaSugerida: "Assistente do Dia",
      acaoSugerida: acaoPagina("Assistente do Dia"),
    },
  })
}

async function consultaEscritorio(clientes) {
  const [pendencias, novidades] = await Promise.all([
    carregarPendenciasOperacionais(clientes),
    carregarNovidadesHoje(clientes),
  ])
  const grupos = agruparPendenciasPorCliente(pendencias)
  const porCategoria = new Map()
  for (const item of pendencias) porCategoria.set(item.categoria, (porCategoria.get(item.categoria) || 0) + 1)
  const itens = [...porCategoria.entries()].map(([categoria, total], indice) => ({
    id: `categoria-${indice}`,
    titulo: categoria,
    detalhe: `${total} ${total === 1 ? "item aberto" : "itens abertos"}`,
    status: "Pendente",
  }))
  const resposta = pendencias.length
    ? `O escritório possui ${pendencias.length} pendência${pendencias.length === 1 ? "" : "s"} em ${grupos.length} cliente${grupos.length === 1 ? "" : "s"}. A prioridade é ${pendencias[0].cliente}: ${pendencias[0].titulo}, ${String(pendencias[0].status || "exige atenção").toLowerCase()}. Hoje também houve ${novidades.length} ${novidades.length === 1 ? "atualização" : "atualizações"} registrada${novidades.length === 1 ? "" : "s"}.`
    : `O escritório não possui pendências abertas. Hoje houve ${novidades.length} ${novidades.length === 1 ? "atualização" : "atualizações"} registrada${novidades.length === 1 ? "" : "s"}.`
  return respostaConsulta({
    resposta,
    pontos: grupos.slice(0, 12).map((item) => `${item.cliente}: ${item.titulo} — ${item.status}`),
    recomendacao: pendencias.length ? `Comece por ${pendencias[0].cliente}: ${pendencias[0].titulo}.` : "Nenhuma ação imediata necessária.",
    consulta: {
      tipo: "escritorio-hoje",
      titulo: "Situação completa do escritório",
      resumo: `${pendencias.length} pendência${pendencias.length === 1 ? "" : "s"} • ${novidades.length} novidade${novidades.length === 1 ? "" : "s"} hoje.`,
      total: pendencias.length,
      itens: grupos.slice(0, 60),
      categorias: itens,
      novidades: novidades.slice(0, 30),
      prioridadePrincipal: pendencias[0] || null,
      paginaSugerida: "Assistente do Dia",
      acaoSugerida: acaoPagina("Assistente do Dia"),
    },
  })
}

async function detectarConsultaInteligente({ mensagem, clienteId, usuario, intencaoForcada = null }) {
  const texto = normalizar(mensagem)
  if (!texto && !intencaoForcada) return null

  const clientes = await carregarClientes(usuario)
  const localizado = localizarCliente(clientes, texto, clienteId)
  if (!intencaoForcada && !consultaSolicitada(texto, localizado.cliente || (localizado.ambiguo ? {} : null), clienteId)) return null
  if (localizado.ambiguo) {
    return respostaConsulta({
      resposta: "Encontrei mais de um cliente compatível. Informe o nome completo ou o código do cliente.",
      consulta: { tipo: "cliente-ambiguo", titulo: "Cliente não identificado", resumo: "Preciso de um nome mais específico.", total: 0, itens: [] },
    })
  }

  const intencao = intencaoForcada || identificarIntencao(texto, localizado.cliente)
  if (!intencao) return null

  // Consultas amplas devem olhar o escritório inteiro, mesmo quando uma Central
  // de Cliente está aberta. O cliente atual só restringe a busca quando o nome
  // foi citado na frase ou quando há referência explícita como “desse cliente”.
  const referenciaAoClienteAtual = /(desse cliente|deste cliente|esse cliente|este cliente|dele|dela|dessa empresa|desta empresa|essa empresa|esta empresa)/.test(texto)
  const intencoesGlobais = new Set([
    "prioridades-hoje",
    "pendencias-gerais",
    "pagamentos-hoje",
    "resolvidas-hoje",
    "mensagens-pendentes",
    "documentos-pendentes",
    "atencao",
    "escritorio",
  ])
  const clienteEscopo = intencoesGlobais.has(intencao)
    ? (localizado.explicito || referenciaAoClienteAtual ? localizado.cliente : null)
    : localizado.cliente

  if (intencao === "clientes") return consultaClientes(clientes, texto)
  if (intencao === "prioridades-hoje") return consultaPrioridadesHoje(clientes, clienteEscopo)
  if (intencao === "pendencias-gerais") return consultaPendenciasGerais(clientes, clienteEscopo)
  if (intencao === "pagamentos-hoje") return consultaPagamentosHoje(clientes, clienteEscopo)
  if (intencao === "resolvidas-hoje") return consultaResolvidasHoje(clientes, clienteEscopo)
  if (intencao === "mensagens-pendentes") return consultaMensagensPendentes(clientes, clienteEscopo)
  if (intencao === "documentos-pendentes") return consultaDocumentosPendentes(clientes, clienteEscopo)
  if (intencao === "fiscal") return consultaFiscal(clientes, localizado.cliente, texto)
  if (intencao === "financeiro") return consultaFinanceiro(clientes, localizado.cliente, texto)
  if (intencao === "documentos") return consultaDocumentos(clientes, localizado.cliente, texto)
  if (intencao === "certificados") return consultaValidades(clientes, localizado.cliente, texto, "certificados")
  if (intencao === "procuracoes") return consultaValidades(clientes, localizado.cliente, texto, "procuracoes")
  if (intencao === "cliente") return consultaCliente(localizado.cliente)
  if (intencao === "atencao") return consultaAtencao(clientes)
  if (intencao === "escritorio") return consultaEscritorio(clientes)
  return null
}

module.exports = { detectarConsultaInteligente }

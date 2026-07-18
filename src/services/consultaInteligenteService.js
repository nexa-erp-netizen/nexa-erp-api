const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const CertificadoDigital = require("../models/CertificadoDigital")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")

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
  return ["pago", "recebido", "concluido", "entregue", "quitado", "conferido", "finalizado"].includes(normalizar(status))
}

function clienteAtivo(cliente) {
  const situacao = normalizar(cliente?.situacaoEmpresa || cliente?.situacao)
  return !["baixada", "inapta", "suspensa", "encerrada", "pausada"].includes(situacao) && normalizar(cliente?.regime) !== "avulso"
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

function respostaConsulta({ resposta, pontos = [], recomendacao = "", consulta }) {
  return {
    resposta,
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

  if (candidatos.length > 1 && candidatos[0].score === candidatos[1].score) return { ambiguo: true, cliente: null }
  return { ambiguo: false, cliente: candidatos[0]?.cliente || atual || null }
}

function consultaSolicitada(texto) {
  return /(^|\s)(qual|quais|quanto|quantos|quantas|liste|listar|consulte|consultar|verifique|verificar|existe|existem|tem|ha|como esta|resuma|resumo|situacao)(\s|$)/.test(texto)
    || /(precisam de atencao|precisa de atencao|vence hoje|vencem hoje|em atraso|vencid|proximos? vencimentos?)/.test(texto)
}

function identificarIntencao(texto, cliente) {
  if (/(como esta o escritorio|resumo do escritorio|escritorio hoje|situacao do escritorio|prioridades de hoje)/.test(texto)) return "escritorio"
  if (/(clientes?).*(atencao|prioridade|critico|pendenc)|precisam de atencao|precisa de atencao/.test(texto)) return "atencao"
  if (/certificad/.test(texto)) return "certificados"
  if (/procurac/.test(texto)) return "procuracoes"
  if (/(document|arquivo|anexo)/.test(texto)) return "documentos"
  if (/(financeir|honor|cobranc|receber|pagar|inadimpl|valor pendente)/.test(texto)) return "financeiro"
  if (/(fiscal|obrig|pendenc|das|imposto|tribut|vencimento)/.test(texto)) return "fiscal"
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
  let itens = await Financeiro.findAll({ order: [["createdAt", "DESC"]], limit: 1000 })
  itens = filtrarEscopo(itens, clientes, cliente).filter((item) => !encerrado(item.status))
  if (/(receber|honor|cobranc|inadimpl)/.test(texto)) itens = itens.filter((item) => !/(despesa|pagar|saida)/.test(normalizar(item.tipo)))
  if (/(pagar|despesa|contas a pagar)/.test(texto)) itens = itens.filter((item) => /(despesa|pagar|saida)/.test(normalizar(item.tipo)))
  const filtro = periodo(texto)
  itens = ordenarData(filtrarPeriodo(itens, filtro, "vencimento"), "vencimento")
  const total = itens.reduce((soma, item) => soma + numeroMoeda(item.valor), 0)
  const exibidos = itens.slice(0, 30).map((item) => ({
    id: item.id,
    cliente: item.cliente,
    titulo: item.descricao || item.tipo || "Lançamento financeiro",
    detalhe: item.tipo || "Tipo não informado",
    data: item.vencimento,
    dataFormatada: formatarData(item.vencimento),
    status: textoPrazo(diasAte(item.vencimento)),
    valor: formatarMoeda(numeroMoeda(item.valor)),
  }))
  const nome = cliente ? ` de ${nomeCliente(cliente)}` : ""
  return respostaConsulta({
    resposta: itens.length ? `O financeiro${nome} possui ${itens.length} lançamento${itens.length === 1 ? "" : "s"} pendente${itens.length === 1 ? "" : "s"}, totalizando ${formatarMoeda(total)}.` : `Não encontrei lançamentos financeiros pendentes${nome}.`,
    pontos: exibidos.slice(0, 8).map((item) => `${item.cliente}: ${item.titulo} — ${item.valor} — ${item.status}`),
    consulta: {
      tipo: "financeiro",
      titulo: cliente ? `Financeiro — ${nomeCliente(cliente)}` : "Financeiro pendente",
      resumo: `${itens.length} lançamento${itens.length === 1 ? "" : "s"} • ${formatarMoeda(total)}.`,
      total: itens.length,
      valorTotalFormatado: formatarMoeda(total),
      itens: exibidos,
      paginaSugerida: "Financeiro",
      cliente: cliente ? { id: cliente.id, nome: nomeCliente(cliente) } : null,
      acaoSugerida: acaoPagina("Financeiro", cliente),
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

async function consultaAtencao(clientes) {
  const ativos = clientes.filter(clienteAtivo)
  const nomes = nomesPermitidos(ativos)
  const ids = new Set(ativos.map((item) => Number(item.id)))
  const [fiscais, financeiros, certificados, procuracoes] = await Promise.all([
    Fiscal.findAll({ limit: 1200 }),
    Financeiro.findAll({ limit: 1200 }),
    CertificadoDigital.findAll({ limit: 500 }),
    ProcuracaoEcac.findAll({ limit: 500 }),
  ])
  const mapa = new Map(ativos.map((cliente) => [normalizar(nomeCliente(cliente)), { cliente, score: 0, motivos: [] }]))
  fiscais.filter((item) => nomes.has(normalizar(item.cliente)) && !encerrado(item.status)).forEach((item) => {
    const linha = mapa.get(normalizar(item.cliente))
    const dias = diasAte(item.vencimento)
    if (!linha || dias === null) return
    if (dias < 0) { linha.score += 8; linha.motivos.push(`${item.obrigacao || "Obrigação"} vencida`) }
    else if (dias === 0) { linha.score += 6; linha.motivos.push(`${item.obrigacao || "Obrigação"} vence hoje`) }
    else if (dias <= 3) { linha.score += 4; linha.motivos.push(`${item.obrigacao || "Obrigação"} vence em ${dias} dias`) }
  })
  financeiros.filter((item) => nomes.has(normalizar(item.cliente)) && !encerrado(item.status)).forEach((item) => {
    const linha = mapa.get(normalizar(item.cliente))
    if (linha && (diasAte(item.vencimento) ?? 999) < 0) { linha.score += 5; linha.motivos.push(`Financeiro vencido: ${item.descricao || "lançamento"}`) }
  })
  for (const [lista, rotulo] of [[certificados, "Certificado"], [procuracoes, "Procuração"]]) {
    lista.filter((item) => ids.has(Number(item.clienteId))).forEach((item) => {
      const cliente = ativos.find((c) => Number(c.id) === Number(item.clienteId))
      const linha = cliente ? mapa.get(normalizar(nomeCliente(cliente))) : null
      const dias = diasAte(item.dataValidade)
      if (!linha || dias === null) return
      if (dias < 0) { linha.score += 7; linha.motivos.push(`${rotulo} vencido`) }
      else if (dias <= 30) { linha.score += 3; linha.motivos.push(`${rotulo} vence em ${dias} dias`) }
    })
  }
  const ranking = [...mapa.values()].filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
  const exibidos = ranking.slice(0, 20).map((item) => ({
    id: item.cliente.id,
    clienteId: item.cliente.id,
    cliente: nomeCliente(item.cliente),
    titulo: nomeCliente(item.cliente),
    detalhe: [...new Set(item.motivos)].slice(0, 4).join(" • "),
    status: item.score >= 12 ? "Prioridade alta" : item.score >= 6 ? "Prioridade média" : "Atenção preventiva",
  }))
  return respostaConsulta({
    resposta: ranking.length ? `${ranking.length} cliente${ranking.length === 1 ? " precisa" : "s precisam"} de atenção com base nos dados atuais.` : "Nenhum cliente ativo apresenta alerta crítico agora.",
    pontos: exibidos.slice(0, 8).map((item) => `${item.cliente}: ${item.status} — ${item.detalhe}`),
    recomendacao: ranking.length ? "Comece pelos clientes classificados como prioridade alta." : "Mantenha o acompanhamento preventivo.",
    consulta: {
      tipo: "clientes-atencao",
      titulo: "Clientes que precisam de atenção",
      resumo: `${ranking.length} cliente${ranking.length === 1 ? "" : "s"} com alertas.`,
      total: ranking.length,
      itens: exibidos,
      paginaSugerida: "Assistente do Dia",
      acaoSugerida: acaoPagina("Assistente do Dia"),
    },
  })
}

async function consultaEscritorio(clientes) {
  const ativos = clientes.filter(clienteAtivo)
  const nomes = nomesPermitidos(ativos)
  const ids = new Set(ativos.map((item) => Number(item.id)))
  const [fiscais, financeiros, certificados, procuracoes] = await Promise.all([
    Fiscal.findAll({ limit: 1200 }),
    Financeiro.findAll({ limit: 1200 }),
    CertificadoDigital.findAll({ limit: 500 }),
    ProcuracaoEcac.findAll({ limit: 500 }),
  ])
  const fiscaisAbertos = fiscais.filter((item) => nomes.has(normalizar(item.cliente)) && !encerrado(item.status))
  const financeirosAbertos = financeiros.filter((item) => nomes.has(normalizar(item.cliente)) && !encerrado(item.status))
  const metricas = {
    ativos: ativos.length,
    vencidas: fiscaisAbertos.filter((item) => (diasAte(item.vencimento) ?? 999) < 0).length,
    hoje: fiscaisAbertos.filter((item) => diasAte(item.vencimento) === 0).length,
    tresDias: fiscaisAbertos.filter((item) => { const d = diasAte(item.vencimento); return d !== null && d > 0 && d <= 3 }).length,
    financeiro: financeirosAbertos.filter((item) => (diasAte(item.vencimento) ?? 999) < 0).length,
    certificados: certificados.filter((item) => ids.has(Number(item.clienteId)) && (diasAte(item.dataValidade) ?? 999) <= 30).length,
    procuracoes: procuracoes.filter((item) => ids.has(Number(item.clienteId)) && (diasAte(item.dataValidade) ?? 999) <= 30).length,
  }
  const itens = [
    { titulo: "Clientes ativos", detalhe: String(metricas.ativos), status: "Carteira operacional" },
    { titulo: "Obrigações vencidas", detalhe: String(metricas.vencidas), status: metricas.vencidas ? "Ação imediata" : "Sem vencidas" },
    { titulo: "Vencimentos de hoje", detalhe: String(metricas.hoje), status: metricas.hoje ? "Revisar hoje" : "Nenhum" },
    { titulo: "Vencimentos em até 3 dias", detalhe: String(metricas.tresDias), status: metricas.tresDias ? "Atenção preventiva" : "Nenhum" },
    { titulo: "Financeiro vencido", detalhe: String(metricas.financeiro), status: metricas.financeiro ? "Cobrança necessária" : "Sem atrasos" },
    { titulo: "Certificados até 30 dias", detalhe: String(metricas.certificados), status: metricas.certificados ? "Planejar renovação" : "Nenhum" },
    { titulo: "Procurações até 30 dias", detalhe: String(metricas.procuracoes), status: metricas.procuracoes ? "Planejar renovação" : "Nenhuma" },
  ]
  const criticos = metricas.vencidas + metricas.hoje + metricas.financeiro
  return respostaConsulta({
    resposta: criticos ? `O escritório possui ${criticos} ${criticos === 1 ? "item" : "itens"} de atenção imediata hoje.` : "O escritório não apresenta itens críticos vencidos ou com vencimento hoje.",
    pontos: itens.map((item) => `${item.titulo}: ${item.detalhe} — ${item.status}`),
    recomendacao: criticos ? "Abra o Assistente do Dia e trate primeiro os itens vencidos." : "Revise os próximos vencimentos para manter a operação preventiva.",
    consulta: {
      tipo: "escritorio-hoje",
      titulo: "Situação do escritório hoje",
      resumo: `${criticos} ${criticos === 1 ? "item imediato" : "itens imediatos"}.`,
      total: itens.length,
      itens,
      paginaSugerida: "Assistente do Dia",
      acaoSugerida: acaoPagina("Assistente do Dia"),
    },
  })
}

async function detectarConsultaInteligente({ mensagem, clienteId, usuario }) {
  const texto = normalizar(mensagem)
  if (!texto || !consultaSolicitada(texto)) return null

  const clientes = await carregarClientes(usuario)
  const localizado = localizarCliente(clientes, texto, clienteId)
  if (localizado.ambiguo) {
    return respostaConsulta({
      resposta: "Encontrei mais de um cliente compatível. Informe o nome completo ou selecione o cliente no campo de contexto.",
      consulta: { tipo: "cliente-ambiguo", titulo: "Cliente não identificado", resumo: "Preciso de um nome mais específico.", total: 0, itens: [] },
    })
  }

  const intencao = identificarIntencao(texto, localizado.cliente)
  if (!intencao) return null
  if (intencao === "clientes") return consultaClientes(clientes, texto)
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

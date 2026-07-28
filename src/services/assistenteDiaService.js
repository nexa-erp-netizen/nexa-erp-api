import { montarAlertasIdentidadeDigital } from "./alertasIdentidadeService"
import { aplicarPriorizacaoFila } from "./priorizacaoService"
import {
  criarMapaClientesOperacionais,
  localizarClienteOperacional,
  clienteOperacionalAtivo,
} from "./clienteOperacionalService"

function hojeBase() {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return hoje
}

export function diferencaDias(data) {
  if (!data) return null

  const texto = String(data).slice(0, 10)
  const alvo = new Date(`${texto}T00:00:00`)

  if (Number.isNaN(alvo.getTime())) return null

  return Math.ceil((alvo - hojeBase()) / (1000 * 60 * 60 * 24))
}

export function textoPrazo(dias) {
  if (dias === null || dias === undefined) return "Sem vencimento"
  if (dias < 0) return `Atrasado há ${Math.abs(dias)} dia(s)`
  if (dias === 0) return "Vence hoje"
  if (dias === 1) return "Vence amanhã"
  return `Vence em ${dias} dias`
}

function textoMinusculoPrazo(data) {
  const dias = diferencaDias(data)
  return textoPrazo(dias).toLowerCase()
}

function normalizarTexto(valor) {
  return String(valor || "").trim().toLowerCase()
}

function obterDadosParcelamento(item = {}) {
  if (item.parcelamento && typeof item.parcelamento === "object") {
    return item.parcelamento
  }

  const texto = String(item.observacao || "")
  const bloco = texto.match(/\[PARCELAMENTO\]([\s\S]*?)\[\/PARCELAMENTO\]/)

  if (!bloco) return null

  const conteudo = bloco[1]
  const parcela = conteudo.match(/Parcela:\s*(\d+|-)\/(\d+|-)/i)
  const dia = conteudo.match(/Vencimento recorrente:\s*dia\s*(\d+|-)/i)
  const orgao = conteudo.match(/Órgão:\s*(.*)/i)
  const descricao = conteudo.match(/Descrição:\s*(.*)/i)

  return {
    orgao: orgao?.[1]?.trim() || "Receita Federal",
    descricao: descricao?.[1]?.trim() || "Parcelamento",
    parcelaAtual: parcela?.[1] === "-" ? "" : parcela?.[1] || "",
    totalParcelas: parcela?.[2] === "-" ? "" : parcela?.[2] || "",
    diaVencimento: dia?.[1] === "-" ? "" : dia?.[1] || "",
  }
}

function tituloObrigacaoFiscal(item, obrigacao) {
  if (obrigacao !== "Parcelamento") return obrigacao

  const dados = obterDadosParcelamento(item)
  if (!dados) return "Parcelamento"

  return `Parcelamento ${dados.parcelaAtual || "-"}/${dados.totalParcelas || "-"}`
}

function descricaoObrigacaoFiscal(item, textoBase) {
  if (item?.obrigacao !== "Parcelamento") return textoBase

  const dados = obterDadosParcelamento(item)
  if (!dados) return textoBase

  const orgao = dados.orgao ? `${dados.orgao} • ` : ""
  return `${orgao}Parcela ${dados.parcelaAtual || "-"}/${dados.totalParcelas || "-"} ${textoMinusculoPrazo(item.vencimento)}.`
}

function obterNomeCliente(cliente) {
  return (
    cliente?.nome ||
    cliente?.cliente ||
    cliente?.razaoSocial ||
    cliente?.nomeFantasia ||
    cliente?.empresa ||
    "Cliente sem nome"
  )
}

function obterClienteId(cliente) {
  return cliente?.id || cliente?.clienteId || cliente?.idCliente || null
}

function clienteChave(nome) {
  return normalizarTexto(nome)
}

function montarMapaClientes(clientes = []) {
  return criarMapaClientesOperacionais(clientes)
}

function localizarCliente(mapaClientes, nome) {
  return localizarClienteOperacional(mapaClientes, nome)
}

function criarAcao({
  id,
  cliente,
  clienteId,
  clienteDados,
  modulo,
  titulo,
  descricao,
  prioridade,
  destino,
  referenciaId,
  modeloWhatsApp,
  tipo = "operacional",
  data,
  secao = "",
}) {
  return {
    id,
    cliente: cliente || "Cliente sem nome",
    clienteId: clienteId || null,
    clienteDados: clienteDados || null,
    modulo,
    titulo,
    descricao,
    prioridade,
    destino,
    referenciaId,
    modeloWhatsApp,
    tipo,
    data,
    secao,
    status: "pendente",
  }
}

function fiscalAtivo(item) {
  const status = normalizarTexto(item?.status)

  return (
    !status.includes("concluído") &&
    !status.includes("concluido") &&
    !status.includes("cancelado") &&
    !status.includes("pago pelo escritório")
  )
}

function aguardandoPagamentoFiscal(item) {
  const status = normalizarTexto(item?.status)

  return (
    fiscalAtivo(item) &&
    !status.includes("pago") &&
    !status.includes("enviado")
  )
}

function documentoPendente(item) {
  const origem = String(item?.origem || "")
  const status = String(item?.status || "")

  return (
    origem === "Cliente → Escritório" &&
    ["Recebido", "Em análise", "Entregue pelo cliente"].includes(status)
  )
}

function pendenciaAberta(item) {
  const status = normalizarTexto(item?.status)
  return status && !status.includes("concluída") && !status.includes("concluida")
}

export function montarAcoesDoDia({
  clientes = [],
  fiscal = [],
  pendencias = [],
  documentos = [],
  financeiro = [],
  planejamento = [],
  certificados = [],
  procuracoes = [],
} = {}) {
  const mapaClientes = montarMapaClientes(clientes)
  const mapaTodosClientes = new Map()
  clientes.forEach((cliente) => {
    [cliente?.nome, cliente?.cliente, cliente?.razaoSocial, cliente?.nomeFantasia, cliente?.empresa]
      .filter(Boolean)
      .forEach((nome) => mapaTodosClientes.set(normalizarTexto(nome), cliente))
  })
  const acoes = []

  montarAlertasIdentidadeDigital({ clientes, certificados, procuracoes }).forEach((alerta) => {
    acoes.push(criarAcao({
      id: `identidade-${alerta.id}`,
      cliente: alerta.cliente,
      clienteId: alerta.clienteId,
      clienteDados: alerta.clienteDados,
      modulo: "Identidade Digital",
      titulo: alerta.titulo,
      descricao: alerta.descricao,
      prioridade: alerta.prioridade,
      destino: alerta.destino,
      referenciaId: alerta.referenciaId,
      tipo: "identidade-digital",
      data: alerta.data,
    }))
  })

  planejamento
    .filter((item) => item?.status !== "concluido" && item?.status !== "concluído")
    .forEach((item) => {
      const dias = diferencaDias(item.data)
      if (dias === null || dias < -30 || dias > 7) return

      const clienteCadastro = localizarCliente(mapaClientes, item.cliente) || item.clienteDados || null
      if (!clienteOperacionalAtivo(clienteCadastro)) return
      const prioridadeBase = Number(item.prioridade || 30)
      const prioridadePrazo = dias < 0 ? 55 + Math.min(Math.abs(dias) * 3, 30) : dias === 0 ? 50 : dias <= 3 ? 35 : 20

      acoes.push(criarAcao({
        id: `planejamento-${item.id}`,
        cliente: item.cliente || obterNomeCliente(clienteCadastro),
        clienteId: obterClienteId(clienteCadastro) || item.clienteId,
        clienteDados: clienteCadastro,
        modulo: item.modulo || item.tipo || "Agenda",
        titulo: item.titulo || "Ação programada",
        descricao: `${item.detalhes || "Ação prevista no planejamento anual"} • ${textoPrazo(dias)}.`,
        prioridade: prioridadeBase + prioridadePrazo,
        destino: item.modulo || "Agenda",
        referenciaId: item.id,
        tipo: "planejamento-anual",
        data: item.data,
      }))
    })

  fiscal.filter(fiscalAtivo).forEach((item) => {
    const clienteCadastro = localizarCliente(mapaClientes, item.cliente)
    if (!clienteCadastro) return
    const cliente = item.cliente || obterNomeCliente(clienteCadastro)
    const clienteId = obterClienteId(clienteCadastro) || item.clienteId || item.cliente_id
    const obrigacaoOriginal = item.obrigacao || item.tipo || "Obrigação fiscal"
    const obrigacao = tituloObrigacaoFiscal(item, obrigacaoOriginal)
    const dias = diferencaDias(item.vencimento)
    const status = normalizarTexto(item.status)
    const valor = Number(String(item.valor || 0).replace(".", "").replace(",", ".")) || 0

    if (dias !== null && dias < 0 && aguardandoPagamentoFiscal(item)) {
      acoes.push(criarAcao({
        id: `fiscal-atrasado-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "Fiscal",
        titulo: item.obrigacao === "Parcelamento" ? `Enviar ${obrigacao}` : `Resolver ${obrigacao}`,
        descricao: descricaoObrigacaoFiscal(item, `${obrigacao} ${textoPrazo(dias).toLowerCase()}.`),
        prioridade: 100 + Math.min(Math.abs(dias) * 5, 80),
        destino: "Fiscal",
        referenciaId: item.id,
        modeloWhatsApp: "vence_hoje",
        data: item.vencimento,
      }))

      acoes.push(criarAcao({
        id: `whatsapp-fiscal-atrasado-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "WhatsApp",
        titulo: "Avisar cliente pelo WhatsApp",
        descricao: item.obrigacao === "Parcelamento"
          ? `Enviar WhatsApp sobre ${obrigacao} ${textoMinusculoPrazo(item.vencimento)}.`
          : `Enviar lembrete sobre ${obrigacao} ${textoMinusculoPrazo(item.vencimento)}.`,
        prioridade: 95 + Math.min(Math.abs(dias) * 3, 50),
        destino: "WhatsApp Inteligente",
        referenciaId: item.id,
        modeloWhatsApp: "vence_hoje",
        tipo: "whatsapp",
        data: item.vencimento,
      }))
      return
    }

    if (dias !== null && dias === 0 && aguardandoPagamentoFiscal(item)) {
      acoes.push(criarAcao({
        id: `fiscal-hoje-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "Fiscal",
        titulo: item.obrigacao === "Parcelamento" ? `Acompanhar ${obrigacao}` : `Acompanhar vencimento de ${obrigacao}`,
        descricao: item.obrigacao === "Parcelamento"
          ? descricaoObrigacaoFiscal(item, `${obrigacao} vence hoje.`)
          : `${obrigacao} vence hoje${valor ? ` no valor de R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}.`,
        prioridade: 90,
        destino: "Fiscal",
        referenciaId: item.id,
        modeloWhatsApp: "vence_hoje",
        data: item.vencimento,
      }))

      acoes.push(criarAcao({
        id: `whatsapp-fiscal-hoje-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "WhatsApp",
        titulo: "Enviar aviso de vencimento hoje",
        descricao: `Mensagem pronta para ${obrigacao} vencendo hoje.`,
        prioridade: 88,
        destino: "WhatsApp Inteligente",
        referenciaId: item.id,
        modeloWhatsApp: "vence_hoje",
        tipo: "whatsapp",
        data: item.vencimento,
      }))
      return
    }

    if (dias !== null && dias <= 3 && dias > 0 && aguardandoPagamentoFiscal(item)) {
      acoes.push(criarAcao({
        id: `fiscal-3dias-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "Fiscal",
        titulo: item.obrigacao === "Parcelamento" ? `Preparar ${obrigacao}` : `Preparar aviso de ${obrigacao}`,
        descricao: descricaoObrigacaoFiscal(item, `${obrigacao} ${textoPrazo(dias).toLowerCase()}.`),
        prioridade: 70 - dias,
        destino: "Fiscal",
        referenciaId: item.id,
        modeloWhatsApp: "vence_3_dias",
        data: item.vencimento,
      }))

      acoes.push(criarAcao({
        id: `whatsapp-fiscal-3dias-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "WhatsApp",
        titulo: "Enviar lembrete preventivo",
        descricao: `Enviar WhatsApp sobre ${obrigacao} ${textoPrazo(dias).toLowerCase()}.`,
        prioridade: 68 - dias,
        destino: "WhatsApp Inteligente",
        referenciaId: item.id,
        modeloWhatsApp: "vence_3_dias",
        tipo: "whatsapp",
        data: item.vencimento,
      }))
    }

    if (status.includes("pendente")) {
      acoes.push(criarAcao({
        id: `fiscal-pendente-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "Fiscal",
        titulo: item.obrigacao === "Parcelamento" ? `Conferir ${obrigacao}` : `Conferir ${obrigacao}`,
        descricao: item.obrigacao === "Parcelamento"
          ? descricaoObrigacaoFiscal(item, `${obrigacao} está pendente no fiscal.`)
          : `${obrigacao} está pendente no fiscal.`,
        prioridade: 55,
        destino: "Fiscal",
        referenciaId: item.id,
        modeloWhatsApp: "das_disponivel",
        data: item.vencimento,
      }))
    }

    if (status.includes("pago pelo cliente")) {
      acoes.push(criarAcao({
        id: `fiscal-pago-cliente-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "Fiscal",
        titulo: "Conferir pagamento recebido",
        descricao: `${obrigacao} foi marcada como paga pelo cliente. Conferir recibo e concluir.`,
        prioridade: 65,
        destino: "Fiscal",
        referenciaId: item.id,
        data: item.vencimento,
      }))
    }
  })

  pendencias.filter(pendenciaAberta).forEach((item) => {
    const clienteCadastro = localizarCliente(mapaClientes, item.cliente)
    if (!clienteCadastro) return
    const cliente = item.cliente || obterNomeCliente(clienteCadastro)
    const clienteId = obterClienteId(clienteCadastro) || item.clienteId || item.cliente_id
    const prazo = item.vencimento || item.prazo
    const dias = diferencaDias(prazo)
    const titulo = item.titulo || item.categoria || "Pendência do cliente"

    acoes.push(criarAcao({
      id: `pendencia-${item.id}`,
      cliente,
      clienteId,
      clienteDados: clienteCadastro,
      modulo: "Atendimento",
      titulo: `Resolver ${titulo}`,
      descricao: dias === null ? `${titulo} aguardando ação.` : `${titulo} ${textoPrazo(dias).toLowerCase()}.`,
      prioridade: dias !== null && dias < 0 ? 85 : 60,
      destino: "Pendências Clientes",
      referenciaId: item.id,
      modeloWhatsApp: "documento_pendente",
      data: prazo,
    }))
  })

  documentos.filter(documentoPendente).forEach((item) => {
    const clienteCadastro = localizarCliente(mapaClientes, item.cliente)
    if (!clienteCadastro) return
    const cliente = item.cliente || obterNomeCliente(clienteCadastro)
    const clienteId = obterClienteId(clienteCadastro) || item.clienteId || item.cliente_id
    const tipo = item.tipo || "Documento"

    acoes.push(criarAcao({
      id: `documento-${item.id}`,
      cliente,
      clienteId,
      clienteDados: clienteCadastro,
      modulo: "Documentos",
      titulo: `Conferir ${tipo}`,
      descricao: `${tipo} recebido pelo cliente e aguardando análise.`,
      prioridade: 58,
      destino: "Documentos Digitais",
      referenciaId: item.id,
      modeloWhatsApp: "documento_recebido",
      data: String(item.createdAt || "").slice(0, 10),
    }))
  })

  financeiro.forEach((item) => {
    const status = normalizarTexto(item.status)
    const tipo = normalizarTexto(item.tipo || item.categoria || item.descricao)
    const origem = normalizarTexto(item.origem)
    const ehServicoCliente = origem.includes("servico do cliente")
      || origem.includes("servico avulso")
      || String(item.referenciaOrigem || "").startsWith("servico-avulso:")
    const clienteCadastro = ehServicoCliente
      ? mapaTodosClientes.get(normalizarTexto(item.cliente))
      : localizarCliente(mapaClientes, item.cliente)
    if (!clienteCadastro) return
    const cliente = item.cliente || obterNomeCliente(clienteCadastro)
    const clienteId = obterClienteId(clienteCadastro) || item.clienteId || item.cliente_id
    const vencimento = item.vencimento || item.dataVencimento || item.data
    const dias = diferencaDias(vencimento)
    const encerrado = status.includes("pago") || status.includes("recebido") || status.includes("concl") || status.includes("cancel")

    if (ehServicoCliente && !encerrado) {
      const prioridade = dias !== null && dias < 0
        ? 105 + Math.min(Math.abs(dias) * 2, 30)
        : dias === 0
          ? 92
          : dias !== null && dias <= 3
            ? 76 - dias
            : 48

      acoes.push(criarAcao({
        id: `cobranca-servico-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "Cobranças",
        titulo: item.descricao || "Cobrança de serviço",
        descricao: dias === null
          ? "Serviço aguardando recebimento."
          : `Cobrança de serviço ${textoPrazo(dias).toLowerCase()}.`,
        prioridade,
        destino: "Clientes",
        referenciaId: item.id,
        tipo: "cobranca-cliente",
        data: vencimento,
        secao: "servicos",
      }))
      return
    }

    if (tipo.includes("honor") && !encerrado) {
      acoes.push(criarAcao({
        id: `honorario-${item.id}`,
        cliente,
        clienteId,
        clienteDados: clienteCadastro,
        modulo: "Financeiro",
        titulo: "Conferir honorários contábeis",
        descricao: dias === null ? "Honorários aguardando pagamento." : `Honorários ${textoPrazo(dias).toLowerCase()}.`,
        prioridade: dias !== null && dias < 0 ? 80 : 50,
        destino: "Financeiro",
        referenciaId: item.id,
        modeloWhatsApp: "honorarios_disponiveis",
        data: vencimento,
      }))
    }
  })

  const vistos = new Set()
  return acoes
    .filter((acao) => {
      const chave = `${acao.cliente}-${acao.modulo}-${acao.titulo}-${acao.referenciaId}`
      if (vistos.has(chave)) return false
      vistos.add(chave)
      return true
    })
    .sort((a, b) => b.prioridade - a.prioridade)
}


function complementarChecklistCliente(clienteItem) {
  // O Assistente do Dia exibe somente ações originadas de registros reais.
  // Checklists por regime e lembretes genéricos não devem criar trabalho.
  return [...clienteItem.acoes].sort((a, b) => b.prioridade - a.prioridade)
}

export function montarFilaAssistenteDia(dados = {}) {
  const acoes = montarAcoesDoDia(dados)
  const mapa = new Map()

  acoes.forEach((acao) => {
    const chave = clienteChave(acao.cliente)

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        id: acao.clienteId || chave,
        cliente: acao.cliente,
        clienteId: acao.clienteId,
        clienteDados: acao.clienteDados || null,
        prioridade: 0,
        nivel: "normal",
        motivos: [],
        acoes: [],
      })
    }

    const item = mapa.get(chave)
    item.prioridade += acao.prioridade
    item.acoes.push(acao)

    if (item.motivos.length < 5) {
      item.motivos.push(acao.descricao)
    }
  })

  const filaBase = Array.from(mapa.values())
    .map((item) => ({
      ...item,
      acoes: complementarChecklistCliente(item),
      motivos: Array.from(new Set(item.motivos)),
    }))

  return aplicarPriorizacaoFila(filaBase)
}

export function montarResumoAssistenteDia(fila = []) {
  const totalAcoes = fila.reduce((total, cliente) => total + cliente.acoes.length, 0)

  return {
    clientes: fila.length,
    urgentes: fila.filter((cliente) => cliente.nivel === "urgente").length,
    atencao: fila.filter((cliente) => cliente.nivel === "atencao").length,
    programados: fila.filter((cliente) => cliente.nivel === "programado").length,
    acoes: totalAcoes,
    progresso: 0,
  }
}

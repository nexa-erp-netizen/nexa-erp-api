const jwt = require("jsonwebtoken")
const { Op } = require("sequelize")
const sequelize = require("../config/database")
const Agenda = require("../models/Agenda")
const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const LancamentoContabil = require("../models/LancamentoContabil")
const Notificacao = require("../models/Notificacao")

const CONFIRMACAO_SIM = /^(?:sim|confirmo|confirmado|pode|pode fazer|pode concluir|pode criar|faça|faca|execute|isso|correto|exatamente|autorizo)(?:\s+.*)?[.!?]*$/i
const CONFIRMACAO_NAO = /^(?:não|nao|cancele|cancelar|não faça|nao faca|deixa|deixe|agora não|agora nao|negativo)(?:\s+.*)?[.!?]*$/i
const ACOES_BLOQUEADAS = /(exclu|apag|delet|remov|transfer|pague|pagar|receb|saque|alter.*valor|mude.*valor|senha|token|chave|certificado)/i

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

function segredoConfirmacao() {
  const segredo = process.env.JWT_SECRET
  if (!segredo) throw new Error("JWT_SECRET não configurado")
  return segredo
}

function criarToken({ usuario, acao }) {
  return jwt.sign(
    {
      finalidade: "nexa-acao-segura",
      usuarioId: Number(usuario.id),
      empresaId: usuario.empresaId || null,
      acao,
    },
    segredoConfirmacao(),
    {
      expiresIn: "5m",
      audience: "nexa-safe-actions",
      issuer: "nexa-erp-api",
    },
  )
}

function verificarToken(token, usuario) {
  const dados = jwt.verify(token, segredoConfirmacao(), {
    audience: "nexa-safe-actions",
    issuer: "nexa-erp-api",
  })

  if (dados.finalidade !== "nexa-acao-segura" || Number(dados.usuarioId) !== Number(usuario.id)) {
    const erro = new Error("Esta confirmação não pertence ao usuário atual.")
    erro.statusCode = 403
    throw erro
  }

  return dados.acao
}

function formatarDataBr(dataIso) {
  const [ano, mes, dia] = String(dataIso || "").slice(0, 10).split("-")
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : String(dataIso || "")
}

function dataIso(data) {
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, "0")
  const dia = String(data.getDate()).padStart(2, "0")
  return `${ano}-${mes}-${dia}`
}

function extrairData(textoOriginal) {
  const texto = normalizar(textoOriginal)
  const hoje = new Date()
  hoje.setHours(12, 0, 0, 0)

  if (/\bdepois de amanha\b/.test(texto)) {
    const data = new Date(hoje)
    data.setDate(data.getDate() + 2)
    return { iso: dataIso(data), trecho: /depois de amanh[aã]/i }
  }

  if (/\bamanha\b/.test(texto)) {
    const data = new Date(hoje)
    data.setDate(data.getDate() + 1)
    return { iso: dataIso(data), trecho: /amanh[aã]/i }
  }

  if (/\bhoje\b/.test(texto)) return { iso: dataIso(hoje), trecho: /hoje/i }

  const completa = String(textoOriginal || "").match(/\b(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])[\/.-](20\d{2})\b/)
  if (completa) {
    const [, dia, mes, ano] = completa
    return {
      iso: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
      trecho: new RegExp(completa[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    }
  }

  const curta = String(textoOriginal || "").match(/\b(0?[1-9]|[12]\d|3[01])[\/.-](0?[1-9]|1[0-2])\b/)
  if (curta) {
    let ano = hoje.getFullYear()
    const dia = Number(curta[1])
    const mes = Number(curta[2])
    const candidata = new Date(ano, mes - 1, dia, 12)
    if (candidata < hoje) ano += 1
    return {
      iso: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
      trecho: new RegExp(curta[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    }
  }

  const diaDoMes = texto.match(/\bdia\s+(0?[1-9]|[12]\d|3[01])\b/)
  if (diaDoMes) {
    const data = new Date(hoje.getFullYear(), hoje.getMonth(), Number(diaDoMes[1]), 12)
    if (data < hoje) data.setMonth(data.getMonth() + 1)
    return { iso: dataIso(data), trecho: new RegExp(`dia\\s+${diaDoMes[1]}`, "i") }
  }

  return null
}

function limparTituloLembrete(mensagem, infoData) {
  let titulo = String(mensagem || "")
    .replace(/^\s*(?:nexa[,:]?\s*)?/i, "")
    .replace(/^\s*(?:crie|criar|adicione|adicionar|agende|agendar|marque|marcar)\s+(?:um[a]?\s+)?(?:lembrete|tarefa|compromisso|reuniao|reunião)?\s*(?:para|de|sobre)?\s*/i, "")
    .replace(/^\s*(?:me\s+lembre|lembre-me)\s+(?:de|para)?\s*/i, "")

  if (infoData?.trecho) titulo = titulo.replace(infoData.trecho, " ")

  return titulo
    .replace(/\b(?:as|às)\s+\d{1,2}(?::\d{2})?\s*(?:h|horas?)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
    .trim()
}

function respostaSistema({ resposta, fala = resposta, acaoPendente = null, acaoExecutada = null, acaoCancelada = false }) {
  return {
    resposta,
    fala,
    pontos: [],
    recomendacao: "",
    fundamentos: [],
    modo: "acao-segura",
    provedor: "sistema",
    modelo: "Nexa Safe Actions 5.4",
    requerConfirmacao: Boolean(acaoPendente),
    acaoPendente,
    acaoExecutada,
    acaoCancelada,
    respondidoEm: new Date().toISOString(),
    aviso: acaoPendente
      ? "A ação só será executada após confirmação explícita."
      : "Ação executada com confirmação do usuário.",
  }
}

async function criarPropostaLembrete({ mensagem, clienteId, usuario }) {
  const texto = normalizar(mensagem)
  const gatilho = /(^|\s)(crie|criar|adicione|adicionar|agende|agendar|marque|marcar|me lembre|lembre-me)(\s|$)/.test(texto)
  const assunto = /(lembrete|tarefa|compromisso|reuniao|reunião|agenda|me lembre|lembre-me)/.test(texto)
  if (!gatilho || !assunto) return null

  const infoData = extrairData(mensagem)
  if (!infoData) {
    return respostaSistema({
      resposta: "Para qual data?",
      fala: "Para qual data?",
    })
  }

  const titulo = limparTituloLembrete(mensagem, infoData)
  if (!titulo || titulo.length < 3) {
    return respostaSistema({
      resposta: "Qual é o lembrete?",
      fala: "Qual é o lembrete?",
    })
  }

  const cliente = clienteId ? await Cliente.findByPk(clienteId) : null
  const acao = {
    tipo: "criar_lembrete",
    titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1),
    data: infoData.iso,
    categoria: /reuniao|reunião/.test(texto) ? "Reunião" : "Tarefa",
    clienteId: cliente?.id || null,
    clienteNome: cliente ? nomeCliente(cliente) : "",
  }
  const resumo = `${acao.titulo} em ${formatarDataBr(acao.data)}${acao.clienteNome ? ` para ${acao.clienteNome}` : ""}`
  const token = criarToken({ usuario, acao })

  return respostaSistema({
    resposta: `Vou criar o lembrete “${resumo}”. Confirmo?`,
    fala: `Vou criar esse lembrete para ${formatarDataBr(acao.data)}. Confirmo?`,
    acaoPendente: {
      tipo: acao.tipo,
      resumo,
      token,
      expiraEmSegundos: 300,
    },
  })
}

function obrigacaoMencionada(mensagem) {
  const texto = normalizar(mensagem)
  const termos = ["das", "honorario", "honorarios", "dctfweb", "dctf", "defis", "pgdas", "inss", "fgts", "parcelamento", "imposto", "guia"]
  return termos.find((termo) => texto.includes(termo)) || ""
}

async function criarPropostaConclusaoFiscal({ mensagem, clienteId, usuario }) {
  const texto = normalizar(mensagem)
  const gatilho = /(conclua|concluir|finalize|finalizar|marque como conclu|marcar como conclu)/.test(texto)
  const assunto = /(pendencia|obrigacao|fiscal|das|honorario|dctf|defis|pgdas|inss|fgts|guia|imposto)/.test(texto)
  if (!gatilho || !assunto) return null

  if (!clienteId) {
    return respostaSistema({
      resposta: "Qual cliente?",
      fala: "Qual cliente?",
    })
  }

  const cliente = await Cliente.findByPk(clienteId)
  if (!cliente) return respostaSistema({ resposta: "Cliente não encontrado." })

  const pendencias = await Fiscal.findAll({
    where: {
      cliente: nomeCliente(cliente),
      status: { [Op.notIn]: ["Concluído", "Pago", "Recebido", "Entregue"] },
    },
    order: [["vencimento", "ASC"], ["createdAt", "DESC"]],
    limit: 30,
  })

  const termo = obrigacaoMencionada(mensagem)
  const filtradas = termo
    ? pendencias.filter((item) => normalizar(item.obrigacao).includes(termo.replace(/s$/, "")))
    : pendencias

  if (!filtradas.length) {
    return respostaSistema({
      resposta: termo ? `Não encontrei ${termo.toUpperCase()} pendente para esse cliente.` : "Não encontrei pendência fiscal aberta para esse cliente.",
      fala: "Não encontrei uma pendência aberta.",
    })
  }

  if (filtradas.length > 1) {
    const opcoes = filtradas.slice(0, 3).map((item) => `${item.obrigacao} ${item.competencia || ""}`.trim())
    return respostaSistema({
      resposta: `Encontrei mais de uma pendência: ${opcoes.join("; ")}. Qual delas?`,
      fala: "Encontrei mais de uma pendência. Qual delas?",
    })
  }

  const pendencia = filtradas[0]
  const acao = {
    tipo: "concluir_pendencia_fiscal",
    fiscalId: pendencia.id,
    clienteId: cliente.id,
    clienteNome: nomeCliente(cliente),
    obrigacao: pendencia.obrigacao,
    competencia: pendencia.competencia || "",
  }
  const resumo = `${acao.obrigacao}${acao.competencia ? ` — ${acao.competencia}` : ""} de ${acao.clienteNome}`
  const token = criarToken({ usuario, acao })

  return respostaSistema({
    resposta: `Vou concluir “${resumo}”. Isso também pode gerar lançamento contábil e financeiro. Confirmo?`,
    fala: "Vou concluir essa pendência e gerar os lançamentos necessários. Confirmo?",
    acaoPendente: {
      tipo: acao.tipo,
      resumo,
      token,
      expiraEmSegundos: 300,
    },
  })
}

async function detectarAcaoSegura({ mensagem, clienteId, usuario }) {
  if (!mensagem || !usuario || usuario.perfil === "Cliente") return null

  // Criar um lembrete nunca executa a ação descrita no título. Por isso,
  // “lembre de pagar o DAS” pode ser agendado com segurança.
  const lembrete = await criarPropostaLembrete({ mensagem, clienteId, usuario })
  if (lembrete) return lembrete

  const texto = normalizar(mensagem)
  const parecePedidoAcao = /(^|\s)(crie|criar|adicione|adicionar|agende|agendar|marque|marcar|conclua|concluir|finalize|finalizar|exclua|excluir|apague|apagar|delete|remova|remover|transfira|transferir|pague|pagar|receba|receber|altere|alterar)(\s|$)/.test(texto)

  if (parecePedidoAcao && ACOES_BLOQUEADAS.test(mensagem)) {
    return respostaSistema({
      resposta: "Essa ação não está liberada por voz. Abra a tela correspondente para confirmar manualmente.",
      fala: "Essa ação precisa ser feita manualmente.",
    })
  }

  return criarPropostaConclusaoFiscal({ mensagem, clienteId, usuario })
}

function valorSeguro(valor) {
  if (valor === null || valor === undefined || valor === "") return 0
  let texto = String(valor).replace("R$", "").trim()
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".")
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : 0
}

function planoContaObrigacao(nomeObrigacao) {
  return normalizar(nomeObrigacao).includes("honor") ? "Honorários Contábeis" : "Fiscal"
}

function deveCriarFinanceiro(obrigacao) {
  const texto = normalizar(obrigacao?.obrigacao)
  return ["honor", "servico", "certificado", "abertura", "regularizacao", "consultoria"].some((termo) => texto.includes(termo))
}

async function executarConclusaoFiscal(acao, usuario) {
  return sequelize.transaction(async (transaction) => {
    const obrigacao = await Fiscal.findByPk(acao.fiscalId, { transaction, lock: transaction.LOCK.UPDATE })
    if (!obrigacao) throw new Error("A pendência não existe mais.")
    if (normalizar(obrigacao.status) === "concluido") {
      return { jaExecutada: true, obrigacao }
    }
    if (normalizar(obrigacao.cliente) !== normalizar(acao.clienteNome)) {
      throw new Error("A pendência não pertence ao cliente confirmado.")
    }

    const nomeObrigacao = obrigacao.obrigacao || "Obrigação fiscal"
    const descricao = `${nomeObrigacao} - ${obrigacao.competencia || ""}`.trim()
    const empresaId = usuario.empresaId || obrigacao.empresaId || null

    const lancamentoExistente = await LancamentoContabil.findOne({
      where: {
        cliente: obrigacao.cliente,
        competencia: obrigacao.competencia || "00/0000",
        descricao,
      },
      transaction,
    })

    if (!lancamentoExistente) {
      await LancamentoContabil.create({
        cliente: obrigacao.cliente,
        data: new Date().toISOString().slice(0, 10),
        competencia: obrigacao.competencia || "00/0000",
        tipo: "Despesa",
        planoConta: planoContaObrigacao(nomeObrigacao),
        descricao,
        valor: obrigacao.valor || "0",
        formaPagamento: "",
        observacao: obrigacao.observacao || "Gerado automaticamente pela Nexa Voice após confirmação.",
        anexos: obrigacao.anexos || [],
        empresaId,
      }, { transaction })
    }

    let financeiro = null
    const valor = valorSeguro(obrigacao.valor)
    if (deveCriarFinanceiro(obrigacao) && valor > 0) {
      const referenciaOrigem = `fiscal:${obrigacao.id}`
      financeiro = await Financeiro.findOne({ where: { referenciaOrigem, empresaId }, transaction })
      const dadosFinanceiro = {
        descricao,
        cliente: obrigacao.cliente,
        tipo: "Receber",
        centroCusto: planoContaObrigacao(nomeObrigacao),
        formaPagamento: "Confirmado por voz",
        valor: String(valor),
        vencimento: new Date().toISOString().slice(0, 10),
        status: "Recebido",
        dataRecebimento: new Date().toISOString().slice(0, 10),
        anexos: Array.isArray(obrigacao.anexos) ? obrigacao.anexos : [],
        origem: "Nexa Voice - confirmação segura",
        referenciaOrigem,
        empresaId,
      }
      if (financeiro) await financeiro.update(dadosFinanceiro, { transaction })
      else financeiro = await Financeiro.create(dadosFinanceiro, { transaction })
    }

    await obrigacao.update({ status: "Concluído", alertaFiscal: "Regularizado" }, { transaction })

    if (empresaId) {
      await Notificacao.update(
        { lida: true },
        {
          where: {
            tipo: { [Op.in]: ["fiscal_pago_cliente", "fiscal_recibo_cliente"] },
            lida: false,
            empresaId,
          },
          transaction,
        },
      )
    }

    return { obrigacao, financeiro, jaExecutada: false }
  })
}

async function executarAcaoConfirmada({ token, mensagem, decisao, usuario }) {
  if (!token) return null

  const cancelou = decisao === "cancelar" || CONFIRMACAO_NAO.test(String(mensagem || "").trim())
  const confirmou = decisao === "confirmar" || CONFIRMACAO_SIM.test(String(mensagem || "").trim())

  if (!cancelou && !confirmou) {
    return respostaSistema({
      resposta: "Responda apenas sim ou não para eu executar a ação pendente.",
      fala: "Confirma?",
      acaoPendente: { token, resumo: "Ação aguardando confirmação", tipo: "pendente" },
    })
  }

  if (cancelou) {
    return respostaSistema({
      resposta: "Certo. A ação foi cancelada.",
      fala: "Certo.",
      acaoCancelada: true,
    })
  }

  let acao
  try {
    acao = verificarToken(token, usuario)
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return respostaSistema({
        resposta: "A confirmação expirou. Peça a ação novamente.",
        fala: "A confirmação expirou.",
        acaoCancelada: true,
      })
    }
    throw error
  }

  if (acao.tipo === "criar_lembrete") {
    const evento = await Agenda.create({
      titulo: acao.titulo,
      cliente: acao.clienteNome || null,
      data: acao.data,
      tipo: acao.categoria || "Tarefa",
    })
    return respostaSistema({
      resposta: `Lembrete criado para ${formatarDataBr(acao.data)}.`,
      fala: "Pronto.",
      acaoExecutada: {
        tipo: acao.tipo,
        resumo: `${acao.titulo} — ${formatarDataBr(acao.data)}`,
        paginaAtualizar: "Agenda",
        id: evento.id,
      },
    })
  }

  if (acao.tipo === "concluir_pendencia_fiscal") {
    const resultado = await executarConclusaoFiscal(acao, usuario)
    return respostaSistema({
      resposta: resultado.jaExecutada ? "Essa pendência já estava concluída." : "Pendência concluída com segurança.",
      fala: resultado.jaExecutada ? "Ela já estava concluída." : "Pronto.",
      acaoExecutada: {
        tipo: acao.tipo,
        resumo: `${acao.obrigacao}${acao.competencia ? ` — ${acao.competencia}` : ""}`,
        paginaAtualizar: "Fiscal",
        id: acao.fiscalId,
      },
    })
  }

  throw new Error("Ação não reconhecida ou não autorizada.")
}

module.exports = {
  detectarAcaoSegura,
  executarAcaoConfirmada,
}

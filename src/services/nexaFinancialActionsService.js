const { normalizar, respostaConfirmaExecucao, respostaCancelaExecucao } = require("./regimeParserService")

function models() {
  return {
    Cliente: require("../models/Cliente"),
    MovimentoCliente: require("../models/MovimentoCliente"),
    LancamentoContabil: require("../models/LancamentoContabil"),
  }
}

function sequelizeOp() {
  return require("sequelize").Op
}

const CAMPOS = ["cliente", "tipo", "data", "descricao", "valor", "planoContaNome", "formaPagamento"]

function respostaBase(dados) {
  return { ...dados, conversacionalV2: true, alteracaoSensivel: true }
}

function numeroMonetario(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : null
  let texto = String(valor || "").replace(/r\$/gi, "").replace(/\s/g, "")
  const virgula = texto.lastIndexOf(",")
  const ponto = texto.lastIndexOf(".")
  if (virgula >= 0 && ponto >= 0) texto = virgula > ponto ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "")
  else if (virgula >= 0) texto = texto.replace(/\./g, "").replace(",", ".")
  texto = texto.replace(/[^0-9.-]/g, "")
  const numero = Number(texto)
  return Number.isFinite(numero) && numero > 0 ? numero : null
}

function dataIso(valor) {
  const texto = normalizar(valor)
  if (/^(hoje|data de hoje)$/.test(texto)) return new Date().toISOString().slice(0, 10)
  let partes = String(valor || "").match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/)
  if (partes) return `${partes[3]}-${partes[2]}-${partes[1]}`
  partes = String(valor || "").match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  return partes ? partes[0] : null
}

function tipoMovimento(valor) {
  const texto = normalizar(valor)
  if (/\b(receita|credito|crédito|entrada|recebimento|venda)\b/.test(texto)) return "Receita"
  if (/\b(despesa|debito|débito|saida|saída|pagamento|compra)\b/.test(texto)) return "Despesa"
  return null
}

function intencaoNovoMovimento(mensagem) {
  const texto = normalizar(mensagem)
  const verbo = /\b(lance|lancar|lançar|registre|registrar|adicione|adicionar|inclua|incluir)\b/.test(texto)
  const objeto = /\b(movimento|movimentacao|movimentação|lancamento|lançamento|receita|despesa|credito|crédito|debito|débito|entrada|saida|saída)\b/.test(texto)
  return verbo && objeto && !/\b(financeiro do escritorio|financeiro do escritório|conta a pagar do escritorio|conta a pagar do escritório)\b/.test(texto)
}

function extrairDadosIniciais(mensagem) {
  const original = String(mensagem || "").trim()
  const texto = normalizar(original)
  const valorAchado = original.match(/(?:r\$\s*|valor(?:\s+de)?\s+)([\d.]+(?:,\d{1,2})?)/i)
  const planoAchado = original.match(/(?:plano de contas|categoria)\s+(.+?)(?=\s+(?:via|por|no valor|valor|para|em)\b|$)/i)
  const formaAchada = original.match(/(?:via|forma(?: de pagamento)?|pago(?: com| no)?|recebido(?: com| no)?)\s+(pix|dinheiro|cart[aã]o|boleto|transfer[eê]ncia|cheque)/i)
  const descricaoAchada = original.match(/\b(?:receita|despesa|entrada|sa[ií]da)\s+(?:de|com)\s+(.+?)(?=\s+(?:no valor|valor de|de r\$|r\$|para o cliente|para a cliente|do cliente|da cliente|via|em \d{2}\/\d{2}\/\d{4})\b|$)/i)
  return {
    tipo: tipoMovimento(texto),
    data: dataIso(original),
    valor: valorAchado ? numeroMonetario(valorAchado[1]) : null,
    planoContaNome: planoAchado?.[1]?.trim() || null,
    formaPagamento: formaAchada?.[1]?.trim() || null,
    descricao: descricaoAchada?.[1]?.trim() || null,
  }
}

async function listarClientes(usuario) {
  const { Cliente } = models()
  // O isolamento entre escritórios já é aplicado globalmente por escritorioId.
  // empresaId no usuário não representa o escritório e não deve filtrar clientes.
  return Cliente.findAll({ order: [["nome", "ASC"]] })
}

function localizarCliente(clientes, mensagem, clienteIdAtual = null) {
  const atual = clienteIdAtual ? clientes.find((c) => Number(c.id) === Number(clienteIdAtual)) : null
  const texto = normalizar(mensagem)
  const encontrados = clientes.filter((c) => {
    const nome = normalizar(c.nome)
    const termos = nome.split(" ").filter((termo) => termo.length >= 4)
    return nome && (texto.includes(nome) || (termos.length > 0 && termos.some((termo) => texto.includes(termo))))
  })
  if (encontrados.length === 1) return { cliente: encontrados[0] }
  if (encontrados.length > 1) return { ambiguos: encontrados.slice(0, 5) }
  return atual ? { cliente: atual } : { cliente: null }
}

function proximoCampo(dados) {
  return CAMPOS.find((campo) => !dados[campo]) || null
}

function pergunta(campo) {
  return ({
    cliente: "Para qual cliente é o lançamento? Informe o nome completo.",
    tipo: "É uma receita ou uma despesa?",
    data: "Qual é a data do lançamento? Diga “hoje” ou informe DD/MM/AAAA.",
    descricao: "Qual é a descrição do lançamento?",
    valor: "Qual é o valor?",
    planoContaNome: "Qual é o plano de contas ou categoria?",
    formaPagamento: "Qual é a forma de pagamento, por exemplo PIX, dinheiro, cartão, boleto ou transferência?",
  })[campo]
}

function moeda(valor) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function dataBr(data) {
  return String(data || "").split("-").reverse().join("/")
}

function resumo(dados) {
  return `${dados.tipo} de ${moeda(dados.valor)} para ${dados.clienteNome}, em ${dataBr(dados.data)}; descrição: ${dados.descricao}; plano de contas: ${dados.planoContaNome}; forma: ${dados.formaPagamento}.`
}

function confirmacao(dados) {
  const texto = resumo(dados)
  return respostaBase({
    resposta: `Revise o lançamento: ${texto} Responda “confirmar” para registrar ou “cancelar”. Nada foi gravado ainda.`,
    acaoGuiadaPendente: { tipo: "movimento-cliente-novo", etapa: "confirmacao", dados },
    consulta: { tipo: "confirmacao-movimento-cliente", titulo: "Confirmar lançamento", resumo: texto, total: 1, itens: [{ clienteId: dados.clienteId, cliente: dados.clienteNome, status: "Aguardando confirmação" }] },
  })
}

async function iniciarMovimento({ mensagem, clienteIdAtual, usuario }) {
  if (usuario?.perfil === "Cliente") return respostaBase({ resposta: "Seu perfil não permite criar lançamentos contábeis.", acaoGuiadaConcluida: true })
  const clientes = await listarClientes(usuario)
  const localizado = localizarCliente(clientes, mensagem, clienteIdAtual)
  if (localizado.ambiguos) {
    return respostaBase({ resposta: `Encontrei mais de um cliente: ${localizado.ambiguos.map((c) => c.nome).join(", ")}. Informe o nome completo.`, acaoGuiadaPendente: { tipo: "movimento-cliente-novo", etapa: "coleta", dados: extrairDadosIniciais(mensagem), proximoCampo: "cliente" } })
  }
  const iniciais = extrairDadosIniciais(mensagem)
  const dados = { ...iniciais }
  if (localizado.cliente) Object.assign(dados, { cliente: localizado.cliente.nome, clienteNome: localizado.cliente.nome, clienteId: localizado.cliente.id })
  const campo = proximoCampo(dados)
  if (!campo) return confirmacao(dados)
  return respostaBase({
    resposta: `Vamos registrar o movimento e o lançamento contábil juntos. ${pergunta(campo)} Você pode dizer “cancelar” a qualquer momento.`,
    acaoGuiadaPendente: { tipo: "movimento-cliente-novo", etapa: "coleta", dados, proximoCampo: campo },
    consulta: { tipo: "acao-guiada-movimento-cliente", titulo: "Novo lançamento", resumo: `Aguardando ${campo}.`, total: Object.values(dados).filter(Boolean).length, itens: [] },
  })
}

async function validarRespostaCampo(campo, mensagem, dados, usuario) {
  if (campo === "cliente") {
    const localizado = localizarCliente(await listarClientes(usuario), mensagem)
    if (localizado.ambiguos) return { erro: `Encontrei mais de um cliente: ${localizado.ambiguos.map((c) => c.nome).join(", ")}. Informe o nome completo.` }
    if (!localizado.cliente) return { erro: "Cliente não encontrado. Informe exatamente o nome cadastrado." }
    return { valores: { cliente: localizado.cliente.nome, clienteNome: localizado.cliente.nome, clienteId: localizado.cliente.id } }
  }
  if (campo === "tipo") {
    const tipo = tipoMovimento(mensagem)
    return tipo ? { valores: { tipo } } : { erro: "Informe se é Receita ou Despesa." }
  }
  if (campo === "data") {
    const data = dataIso(mensagem)
    return data ? { valores: { data } } : { erro: "Informe “hoje” ou uma data no formato DD/MM/AAAA." }
  }
  if (campo === "valor") {
    const valor = numeroMonetario(mensagem)
    return valor ? { valores: { valor } } : { erro: "Informe um valor maior que zero." }
  }
  const valor = String(mensagem || "").trim()
  if (!valor) return { erro: pergunta(campo) }
  return { valores: { [campo]: valor.slice(0, campo === "descricao" ? 180 : 100) } }
}

async function executar(dados, usuario) {
  const { Cliente, MovimentoCliente, LancamentoContabil } = models()
  const Op = sequelizeOp()
  const cliente = await Cliente.findByPk(dados.clienteId)
  if (!cliente) {
    return respostaBase({ resposta: "O cliente não está disponível para este escritório. Nenhum lançamento foi criado.", acaoGuiadaConcluida: true })
  }
  const desde = new Date(Date.now() - 10 * 60 * 1000)
  const duplicado = await MovimentoCliente.findOne({ where: { cliente: cliente.nome, tipo: dados.tipo, data: dados.data, descricao: dados.descricao, valor: dados.valor, createdAt: { [Op.gte]: desde } } })
  if (duplicado) return respostaBase({ resposta: "Esse mesmo lançamento já foi registrado recentemente. A duplicidade foi bloqueada.", acaoGuiadaConcluida: true })

  const transaction = await MovimentoCliente.sequelize.transaction()
  try {
    const movimento = await MovimentoCliente.create({
      cliente: cliente.nome, tipo: dados.tipo, data: dados.data, planoContaNome: dados.planoContaNome,
      forma: dados.formaPagamento, formaPagamento: dados.formaPagamento, descricao: dados.descricao,
      valor: dados.valor, status: "Conferido", observacao: "Criado pela Nexa Actions após confirmação",
    }, { transaction })
    const referencia = `movimento-cliente:${movimento.id}`
    const lancamento = await LancamentoContabil.create({
      cliente: cliente.nome, data: dados.data, competencia: `${dados.data.slice(5, 7)}/${dados.data.slice(0, 4)}`,
      tipo: dados.tipo, planoConta: dados.planoContaNome, descricao: dados.descricao, quantidade: 1,
      valorUnitario: Number(dados.valor).toFixed(2), valor: Number(dados.valor).toFixed(2),
      formaPagamento: dados.formaPagamento, observacao: referencia, anexos: [], empresaId: usuario?.empresaId || null,
    }, { transaction })
    await transaction.commit()
    return respostaBase({
      resposta: `Lançamento registrado com sucesso em Movimentos do Cliente e Lançamentos Contábeis para ${cliente.nome}.`,
      acaoGuiadaConcluida: true, clienteIdConfirmado: cliente.id, clienteNomeConfirmado: cliente.nome,
      consulta: { tipo: "movimento-cliente-concluido", titulo: "Lançamento concluído", resumo: resumo(dados), total: 2, itens: [{ clienteId: cliente.id, cliente: cliente.nome, status: "Movimento criado" }, { clienteId: cliente.id, cliente: cliente.nome, status: "Lançamento contábil criado" }] },
      movimentoId: movimento.id, lancamentoContabilId: lancamento.id,
    })
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

async function continuarMovimento(pendente, mensagem, usuario) {
  if (respostaCancelaExecucao(mensagem)) return respostaBase({ resposta: "Lançamento cancelado. Nenhum dado foi gravado.", acaoGuiadaConcluida: true, acaoCancelada: true })
  if (usuario?.perfil === "Cliente") return respostaBase({ resposta: "Seu perfil não permite criar lançamentos contábeis.", acaoGuiadaConcluida: true })
  if (pendente.etapa === "confirmacao") {
    if (!respostaConfirmaExecucao(mensagem)) return respostaBase({ resposta: "Responda “confirmar” para registrar ou “cancelar”. Nada foi gravado ainda.", acaoGuiadaPendente: pendente })
    return executar(pendente.dados, usuario)
  }
  const campo = pendente.proximoCampo || proximoCampo(pendente.dados || {})
  const validacao = await validarRespostaCampo(campo, mensagem, pendente.dados || {}, usuario)
  if (validacao.erro) return respostaBase({ resposta: `${validacao.erro} Tente novamente ou diga “cancelar”.`, acaoGuiadaPendente: pendente })
  const dados = { ...(pendente.dados || {}), ...validacao.valores }
  const proximo = proximoCampo(dados)
  if (!proximo) return confirmacao(dados)
  return respostaBase({
    resposta: `${pergunta(proximo)}`,
    acaoGuiadaPendente: { ...pendente, dados, proximoCampo: proximo },
    consulta: { tipo: "acao-guiada-movimento-cliente", titulo: "Novo lançamento", resumo: `Aguardando ${proximo}.`, total: Object.values(dados).filter(Boolean).length, itens: [] },
  })
}

async function processarNexaFinancialAction({ mensagem, pendente, clienteIdAtual, usuario }) {
  if (pendente?.tipo === "movimento-cliente-novo") return continuarMovimento(pendente, mensagem, usuario)
  if (intencaoNovoMovimento(mensagem)) return iniciarMovimento({ mensagem, clienteIdAtual, usuario })
  return null
}

module.exports = { processarNexaFinancialAction, intencaoNovoMovimento, numeroMonetario, dataIso, tipoMovimento, extrairDadosIniciais, localizarCliente }

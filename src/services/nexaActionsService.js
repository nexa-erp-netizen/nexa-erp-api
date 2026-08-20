const { normalizar, respostaConfirmaExecucao, respostaCancelaExecucao } = require("./regimeParserService")
const { processarNexaFinancialAction } = require("./nexaFinancialActionsService")

function clienteModel() {
  return require("../models/Cliente")
}

function operadorSequelize() {
  return require("sequelize").Op
}

const CAMPOS_CLIENTE = {
  nome: { rotulo: "nome", aliases: ["nome", "nome completo", "razao social", "razão social"], limite: 180 },
  cpf: { rotulo: "CPF", aliases: ["cpf"], digitos: 11 },
  cnpj: { rotulo: "CNPJ", aliases: ["cnpj"], digitos: 14, cnpj: true, opcional: true },
  telefone: { rotulo: "telefone", aliases: ["telefone", "celular", "whatsapp", "whats"], telefone: true },
  email: { rotulo: "e-mail", aliases: ["email", "e-mail"], email: true, opcional: true },
  cep: { rotulo: "CEP", aliases: ["cep"], digitos: 8, opcional: true },
  endereco: { rotulo: "endereço", aliases: ["endereco", "endereço", "rua", "logradouro"], limite: 180, opcional: true },
  numero: { rotulo: "número", aliases: ["numero", "número"], limite: 30, opcional: true },
  complemento: { rotulo: "complemento", aliases: ["complemento"], limite: 100, opcional: true },
  bairro: { rotulo: "bairro", aliases: ["bairro"], limite: 100, opcional: true },
  cidade: { rotulo: "cidade", aliases: ["cidade", "municipio", "município"], limite: 100, opcional: true },
  estado: { rotulo: "UF", aliases: ["estado", "uf"], uf: true, opcional: true },
  dataNascimento: { rotulo: "data de nascimento", aliases: ["data de nascimento", "nascimento"], data: true, opcional: true },
  dataInicioAtividades: { rotulo: "data de início das atividades", aliases: ["data de inicio das atividades", "data de início das atividades", "inicio das atividades", "início das atividades"], data: true },
  regime: { rotulo: "regime tributário", aliases: ["regime tributario", "regime tributário", "regime"], regime: true },
  ramoAtividade: { rotulo: "ramo de atividade", aliases: ["ramo de atividade", "atividade", "ramo"], ramo: true },
  cnaePrincipal: { rotulo: "CNAE principal", aliases: ["cnae principal", "cnae"], limite: 20, opcional: true },
  inscricaoMunicipal: { rotulo: "inscrição municipal", aliases: ["inscricao municipal", "inscrição municipal", "im"], limite: 40, opcional: true },
  inscricaoEstadual: { rotulo: "inscrição estadual", aliases: ["inscricao estadual", "inscrição estadual", "ie"], limite: 40, opcional: true },
  situacaoEmpresa: { rotulo: "situação da empresa", aliases: ["situacao da empresa", "situação da empresa", "situacao", "situação", "status"], situacao: true },
  ativo: { rotulo: "status do cliente (ativo ou inativo)", aliases: ["ativo", "inativo", "status do cliente"], booleano: true },
  observacao: { rotulo: "observação", aliases: ["observacao", "observação"], limite: 2000, opcional: true },
}

const CAMPOS_PRINCIPAIS_CLIENTE = ["nome", "cpf", "telefone", "email", "cnpj"]
const CAMPOS_COMPLEMENTARES_CLIENTE = [
  "ativo", "situacaoEmpresa", "dataInicioAtividades", "regime", "ramoAtividade",
  "cep", "endereco", "numero", "complemento", "bairro", "cidade", "estado",
]
const CAMPOS_NOVO_CLIENTE = [...CAMPOS_PRINCIPAIS_CLIENTE, ...CAMPOS_COMPLEMENTARES_CLIENTE]

const RESPOSTAS_PULAR = /^(pular|pule|nao possui|não possui|nao tem|não tem|sem|depois)$/

function somenteDigitos(valor) {
  return String(valor || "").replace(/\D/g, "")
}

function cpfValido(valor) {
  const cpf = somenteDigitos(valor)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  for (let posicao = 9; posicao <= 10; posicao += 1) {
    let soma = 0
    for (let indice = 0; indice < posicao; indice += 1) soma += Number(cpf[indice]) * (posicao + 1 - indice)
    const digito = ((soma * 10) % 11) % 10
    if (digito !== Number(cpf[posicao])) return false
  }
  return true
}

function cnpjValido(valor) {
  const cnpj = somenteDigitos(valor)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calcular = (base, pesos) => {
    const soma = base.split("").reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const primeiro = calcular(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const segundo = calcular(cnpj.slice(0, 12) + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return cnpj.endsWith(`${primeiro}${segundo}`)
}

function dataIso(valor) {
  const texto = String(valor || "").trim()
  let partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (partes) return `${partes[3]}-${partes[2]}-${partes[1]}`
  partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return partes ? texto : null
}

function validarCampo(campo, valor) {
  const config = CAMPOS_CLIENTE[campo]
  let limpo = String(valor || "").trim()
  if (!config || !limpo) return { erro: `Informe ${config?.rotulo || "o valor"}.` }

  if (config.digitos) {
    limpo = somenteDigitos(limpo)
    if (limpo.length !== config.digitos) return { erro: `${config.rotulo} deve ter ${config.digitos} números.` }
  }
  if (campo === "cpf" && !cpfValido(limpo)) return { erro: "Informe um CPF válido." }
  if (campo === "cnpj" && !cnpjValido(limpo)) return { erro: "Informe um CNPJ válido." }
  if (config.telefone) {
    limpo = somenteDigitos(limpo)
    if (![10, 11].includes(limpo.length)) return { erro: "Informe um telefone com DDD." }
  }
  if (config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) return { erro: "Informe um e-mail válido." }
  if (config.uf) {
    limpo = limpo.toUpperCase()
    if (!/^[A-Z]{2}$/.test(limpo)) return { erro: "Informe a UF com duas letras." }
  }
  if (config.data) {
    limpo = dataIso(limpo)
    if (!limpo) return { erro: "Informe a data no formato DD/MM/AAAA." }
  }
  if (config.booleano) {
    const texto = normalizar(limpo)
    if (/^(ativo|ativa|sim)$/.test(texto)) limpo = true
    else if (/^(inativo|inativa|nao|não)$/.test(texto)) limpo = false
    else return { erro: "Informe se o cliente está ativo ou inativo." }
  }
  if (config.situacao) {
    const opcoes = { ativa: "Ativa", inapta: "Inapta", baixada: "Baixada", suspensa: "Suspensa", "em constituicao": "Em Constituição" }
    limpo = opcoes[normalizar(limpo)]
    if (!limpo) return { erro: "Informe: Ativa, Inapta, Baixada, Suspensa ou Em Constituição." }
  }
  if (config.regime) {
    const opcoes = { avulso: "Avulso", mei: "MEI", "simples nacional": "Simples Nacional", "lucro presumido": "Lucro Presumido", "lucro real": "Lucro Real" }
    limpo = opcoes[normalizar(limpo)]
    if (!limpo) return { erro: "Informe: Avulso, MEI, Simples Nacional, Lucro Presumido ou Lucro Real." }
  }
  if (config.ramo) {
    const opcoes = { servicos: "Serviços", comercio: "Comércio", industria: "Indústria", misto: "Misto" }
    limpo = opcoes[normalizar(limpo)]
    if (!limpo) return { erro: "Informe: Serviços, Comércio, Indústria ou Misto." }
  }
  if (config.limite) limpo = limpo.slice(0, config.limite)
  return { valor: limpo }
}

function respostaBase(dados) {
  return { ...dados, conversacionalV2: true, alteracaoSensivel: true }
}

function intencaoNovoCliente(mensagem) {
  const texto = normalizar(mensagem)
  return /(cadastr|adicion|inclu|crie|criar).{0,30}(novo cliente|nova cliente|cliente novo|cliente nova|uma empresa|novo cadastro)/.test(texto)
    || /^(novo cliente|nova cliente|cadastrar cliente)$/.test(texto)
}

function intencaoAtualizarCliente(mensagem) {
  const texto = normalizar(mensagem)
  if (/(regime|mei|simples nacional|lucro presumido|lucro real)/.test(texto)) return false
  return /(^|\s)(altere|alterar|atualize|atualizar|mude|mudar|troque|trocar|corrija|corrigir)(\s|$)/.test(texto)
    && /(cliente|cadastro|telefone|celular|whatsapp|email|e-mail|cep|endereco|nome|cpf|cnpj|bairro|cidade|estado|uf|cnae|inscricao|regime|atividade|observacao)/.test(texto)
}

function campoNaMensagem(mensagem) {
  const texto = normalizar(mensagem)
  return Object.entries(CAMPOS_CLIENTE)
    .flatMap(([campo, config]) => config.aliases.map((alias) => ({ campo, alias: normalizar(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length)
    .find((item) => new RegExp(`(^|\\s)${item.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`).test(texto))?.campo || null
}

function valorDepoisDePara(mensagem) {
  const original = String(mensagem || "").trim()
  const achou = original.match(/\bpara\s+(.+)$/i)
  return String(achou?.[1] || "").replace(/[.!?]+$/, "").trim()
}

function clientePorMensagem(clientes, mensagem, clienteIdAtual = null) {
  const atual = clienteIdAtual ? clientes.find((item) => Number(item.id) === Number(clienteIdAtual)) : null
  const texto = normalizar(mensagem)
  const encontrados = clientes.filter((item) => {
    const nome = normalizar(item.nome)
    return nome && texto.includes(nome)
  })
  if (encontrados.length === 1) return encontrados[0]
  return atual || null
}

function proximoCampoNovo(dados, campos = CAMPOS_NOVO_CLIENTE) {
  return campos.find((campo) => !Object.prototype.hasOwnProperty.call(dados, campo)) || null
}

function rotuloCampo(campo) {
  return CAMPOS_CLIENTE[campo]?.rotulo || campo
}

function formatarValor(campo, valor) {
  if (campo === "cpf" && somenteDigitos(valor).length === 11) {
    const d = somenteDigitos(valor)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  if (campo === "cnpj" && somenteDigitos(valor).length === 14) {
    const d = somenteDigitos(valor)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }
  if (campo === "ativo") return valor ? "Ativo" : "Inativo"
  return String(valor || "")
}

function perguntaCampo(campo) {
  const perguntas = {
    cpf: "Informe o CPF do cliente ou do responsável pela empresa.",
    cnpj: "Informe o CNPJ da empresa. Se não possuir, diga “pular”.",
    ativo: "O cliente ficará ativo ou inativo no sistema?",
    situacaoEmpresa: "Qual é a situação da empresa: Ativa, Inapta, Baixada, Suspensa ou Em Constituição?",
    regime: "Qual é o regime tributário: Avulso, MEI, Simples Nacional, Lucro Presumido ou Lucro Real?",
    ramoAtividade: "Qual é o ramo de atividade: Serviços, Comércio, Indústria ou Misto?",
    complemento: "Informe o complemento do endereço. Se não possuir, diga “pular”.",
  }
  return perguntas[campo] || `Informe ${rotuloCampo(campo)}${CAMPOS_CLIENTE[campo]?.opcional ? ". Se não possuir, diga “pular”." : "."}`
}

function prepararConfirmacaoNovoCliente(dados) {
  const resumo = CAMPOS_NOVO_CLIENTE
    .filter((campoResumo) => Object.prototype.hasOwnProperty.call(dados, campoResumo) && dados[campoResumo] !== null)
    .map((campoResumo) => `${rotuloCampo(campoResumo)}: ${formatarValor(campoResumo, dados[campoResumo])}`)
    .join("; ") + "."
  return respostaBase({
    resposta: `Revise o cadastro: ${resumo} Responda “confirmar” para criar o cliente ou “cancelar”. Nenhum cadastro foi criado ainda.`,
    acaoGuiadaPendente: { tipo: "cliente-novo", etapa: "confirmacao", dados },
    consulta: { tipo: "confirmacao-final-cliente-novo", titulo: "Confirmar novo cliente", resumo, total: 1, itens: [{ cliente: dados.nome, status: "Aguardando confirmação" }] },
  })
}

async function iniciarNovoCliente() {
  return respostaBase({
    resposta: "Vamos cadastrar um novo cliente. Qual é o nome completo? Você pode cancelar a qualquer momento.",
    acaoGuiadaPendente: { tipo: "cliente-novo", etapa: "coleta-principal", dados: {}, proximoCampo: "nome" },
    consulta: { tipo: "acao-guiada-cliente-novo", titulo: "Novo cliente", resumo: "Aguardando o nome completo.", total: 0, itens: [] },
  })
}

async function continuarNovoCliente(pendente, mensagem, usuario) {
  if (respostaCancelaExecucao(mensagem)) {
    return respostaBase({ resposta: "Cadastro cancelado. Nenhum cliente foi criado.", acaoGuiadaConcluida: true, acaoCancelada: true })
  }

  if (pendente.etapa === "confirmacao") {
    if (!respostaConfirmaExecucao(mensagem)) {
      return respostaBase({
        resposta: "O cadastro ainda não foi criado. Responda “confirmar” para cadastrar ou “cancelar”.",
        acaoGuiadaPendente: pendente,
        consulta: { tipo: "confirmacao-final-cliente-novo", titulo: "Confirmação final", resumo: "Aguardando confirmar ou cancelar.", total: 1, itens: [] },
      })
    }
    if (["Cliente"].includes(usuario?.perfil)) return respostaBase({ resposta: "Seu perfil não permite cadastrar clientes.", acaoGuiadaConcluida: true })
    const Cliente = clienteModel()
    const Op = operadorSequelize()
    const existente = await Cliente.findOne({ where: { [Op.or]: [{ cpf: pendente.dados.cpf }, ...(pendente.dados.cnpj ? [{ cnpj: pendente.dados.cnpj }] : [])] } })
    if (existente) return respostaBase({ resposta: `O cadastro não foi criado porque ${existente.nome} já utiliza esse CPF ou CNPJ.`, acaoGuiadaConcluida: true })
    const cliente = await Cliente.create({ ...pendente.dados, anotacoes: [], proximasAcoes: [], anexos: [] })
    return respostaBase({
      resposta: `Cliente ${cliente.nome} cadastrado com sucesso.`,
      acaoGuiadaConcluida: true,
      clienteIdConfirmado: cliente.id,
      clienteNomeConfirmado: cliente.nome,
      consulta: { tipo: "cliente-novo-concluido", titulo: `Cliente cadastrado — ${cliente.nome}`, resumo: "Cadastro criado após confirmação.", total: 1, itens: [{ clienteId: cliente.id, cliente: cliente.nome, status: "Ativo" }] },
    })
  }

  if (pendente.etapa === "escolha-complemento") {
    const escolha = normalizar(mensagem)
    if (/^(concluir|concluir cadastro|finalizar|finalizar cadastro|so os principais|somente os principais)$/.test(escolha)) {
      return prepararConfirmacaoNovoCliente(pendente.dados || {})
    }
    if (/^(continuar|continuar cadastro|adicionar mais informacoes|mais informacoes|completar cadastro)$/.test(escolha)) {
      const proximo = proximoCampoNovo(pendente.dados || {}, CAMPOS_COMPLEMENTARES_CLIENTE)
      return respostaBase({
        resposta: `Certo, vamos completar o cadastro. ${perguntaCampo(proximo)}`,
        acaoGuiadaPendente: { ...pendente, etapa: "coleta-complementar", proximoCampo: proximo },
        consulta: { tipo: "acao-guiada-cliente-novo", titulo: "Cadastro completo", resumo: `Aguardando ${rotuloCampo(proximo)}.`, total: Object.keys(pendente.dados || {}).length, itens: [] },
      })
    }
    return respostaBase({
      resposta: "Responda “concluir” para cadastrar somente com os dados principais ou “continuar” para adicionar mais informações.",
      acaoGuiadaPendente: pendente,
      consulta: { tipo: "escolha-cadastro-cliente", titulo: "Novo cliente", resumo: "Escolha concluir ou continuar.", total: Object.keys(pendente.dados || {}).length, itens: [] },
    })
  }

  const camposDaEtapa = pendente.etapa === "coleta-complementar" ? CAMPOS_COMPLEMENTARES_CLIENTE : CAMPOS_PRINCIPAIS_CLIENTE
  const campo = pendente.proximoCampo || proximoCampoNovo(pendente.dados || {}, camposDaEtapa)
  const podePular = CAMPOS_CLIENTE[campo]?.opcional && RESPOSTAS_PULAR.test(normalizar(mensagem))
  const validacao = podePular ? { valor: null } : validarCampo(campo, mensagem)
  if (validacao.erro) {
    return respostaBase({
      resposta: `${validacao.erro} Tente novamente ou diga “cancelar”.`,
      acaoGuiadaPendente: pendente,
      consulta: { tipo: "acao-guiada-cliente-novo", titulo: "Novo cliente", resumo: `Aguardando ${rotuloCampo(campo)}.`, total: 0, itens: [] },
    })
  }

  const dados = { ...(pendente.dados || {}), [campo]: validacao.valor }
  const proximo = proximoCampoNovo(dados, camposDaEtapa)
  if (proximo) {
    return respostaBase({
      resposta: `${rotuloCampo(campo)} registrado. ${perguntaCampo(proximo)}`,
      acaoGuiadaPendente: { ...pendente, dados, proximoCampo: proximo },
      consulta: { tipo: "acao-guiada-cliente-novo", titulo: "Novo cliente", resumo: `Aguardando ${rotuloCampo(proximo)}.`, total: Object.keys(dados).length, itens: [] },
    })
  }

  if (pendente.etapa !== "coleta-complementar") {
    return respostaBase({
      resposta: "Dados principais registrados. Deseja “concluir” o cadastro agora ou “continuar” para adicionar situação, início das atividades, regime tributário, ramo e endereço?",
      acaoGuiadaPendente: { tipo: "cliente-novo", etapa: "escolha-complemento", dados },
      consulta: { tipo: "escolha-cadastro-cliente", titulo: "Dados principais concluídos", resumo: "Escolha concluir ou continuar com mais informações.", total: Object.keys(dados).length, itens: [{ cliente: dados.nome, status: "Aguardando escolha" }] },
    })
  }
  return prepararConfirmacaoNovoCliente(dados)
}

async function iniciarAtualizacaoCliente({ mensagem, clienteIdAtual, usuario }) {
  if (usuario?.perfil === "Cliente") return respostaBase({ resposta: "Seu perfil não permite editar o cadastro interno.", acaoGuiadaConcluida: true })
  const Cliente = clienteModel()
  const clientes = await Cliente.findAll({ order: [["nome", "ASC"]] })
  const cliente = clientePorMensagem(clientes, mensagem, clienteIdAtual)
  if (!cliente) return respostaBase({ resposta: "Abra o cliente correto ou informe o nome completo antes de pedir a alteração.", acaoGuiadaConcluida: true })
  const campo = campoNaMensagem(mensagem)
  if (!campo) return respostaBase({ resposta: "Qual dado deseja alterar? Por exemplo: telefone, e-mail, CEP, endereço, CNAE ou observação.", acaoGuiadaConcluida: true })
  if (["cpf", "cnpj"].includes(campo)) return respostaBase({ resposta: `${rotuloCampo(campo)} é um identificador sensível. Abra o cadastro para revisar documentos antes da alteração.`, acaoGuiadaConcluida: true })
  const valorInformado = valorDepoisDePara(mensagem)
  if (!valorInformado) {
    return respostaBase({
      resposta: `Qual é o novo ${rotuloCampo(campo)} de ${cliente.nome}?`,
      acaoGuiadaPendente: { tipo: "cliente-atualizar", etapa: "coleta-valor", clienteId: cliente.id, clienteNome: cliente.nome, campo },
      consulta: { tipo: "acao-guiada-cliente-atualizar", titulo: `Atualizar ${cliente.nome}`, resumo: `Aguardando ${rotuloCampo(campo)}.`, total: 1, itens: [] },
    })
  }
  return prepararAtualizacaoCliente({ cliente, campo, valorInformado })
}

function prepararAtualizacaoCliente({ cliente, campo, valorInformado }) {
  const validacao = validarCampo(campo, valorInformado)
  if (validacao.erro) return respostaBase({ resposta: validacao.erro, acaoGuiadaConcluida: true })
  const anterior = cliente[campo] || "não informado"
  return respostaBase({
    resposta: `Revise antes de salvar: ${rotuloCampo(campo)} de ${cliente.nome}: “${anterior}” → “${validacao.valor}”. Responda “confirmar” para alterar ou “cancelar”.`,
    acaoGuiadaPendente: { tipo: "cliente-atualizar", etapa: "confirmacao", clienteId: cliente.id, clienteNome: cliente.nome, campo, valorNovo: validacao.valor, valorAnterior: anterior },
    consulta: { tipo: "confirmacao-final-cliente-atualizar", titulo: `Confirmar alteração — ${cliente.nome}`, resumo: `${rotuloCampo(campo)}: ${anterior} → ${validacao.valor}`, total: 1, itens: [{ clienteId: cliente.id, cliente: cliente.nome, status: "Aguardando confirmação" }] },
  })
}

async function continuarAtualizacaoCliente(pendente, mensagem, usuario) {
  if (respostaCancelaExecucao(mensagem)) return respostaBase({ resposta: "Alteração cancelada. Nenhum dado foi modificado.", acaoGuiadaConcluida: true, acaoCancelada: true })
  if (usuario?.perfil === "Cliente") return respostaBase({ resposta: "Seu perfil não permite editar o cadastro interno.", acaoGuiadaConcluida: true })
  const Cliente = clienteModel()
  const cliente = await Cliente.findByPk(pendente.clienteId)
  if (!cliente) return respostaBase({ resposta: "O cliente não está mais disponível.", acaoGuiadaConcluida: true })
  if (pendente.etapa === "coleta-valor") return prepararAtualizacaoCliente({ cliente, campo: pendente.campo, valorInformado: mensagem })
  if (!respostaConfirmaExecucao(mensagem)) {
    return respostaBase({ resposta: "A alteração ainda não foi executada. Responda “confirmar” ou “cancelar”.", acaoGuiadaPendente: pendente })
  }
  await cliente.update({ [pendente.campo]: pendente.valorNovo })
  return respostaBase({
    resposta: `${rotuloCampo(pendente.campo)} de ${cliente.nome} atualizado com sucesso.`,
    acaoGuiadaConcluida: true,
    clienteIdConfirmado: cliente.id,
    clienteNomeConfirmado: cliente.nome,
    consulta: { tipo: "cliente-atualizado-concluido", titulo: `Cadastro atualizado — ${cliente.nome}`, resumo: `${rotuloCampo(pendente.campo)} atualizado após confirmação.`, total: 1, itens: [{ clienteId: cliente.id, cliente: cliente.nome, status: "Concluído" }] },
  })
}

async function processarNexaAction({ mensagem, pendente = null, clienteIdAtual = null, usuario }) {
  const financeiro = await processarNexaFinancialAction({ mensagem, pendente, clienteIdAtual, usuario })
  if (financeiro) return financeiro
  if (pendente?.tipo === "cliente-novo") return continuarNovoCliente(pendente, mensagem, usuario)
  if (pendente?.tipo === "cliente-atualizar") return continuarAtualizacaoCliente(pendente, mensagem, usuario)
  if (intencaoNovoCliente(mensagem)) return iniciarNovoCliente()
  if (intencaoAtualizarCliente(mensagem)) return iniciarAtualizacaoCliente({ mensagem, clienteIdAtual, usuario })
  return null
}

module.exports = {
  processarNexaAction,
  validarCampo,
  cpfValido,
  cnpjValido,
  intencaoNovoCliente,
  intencaoAtualizarCliente,
  campoNaMensagem,
}

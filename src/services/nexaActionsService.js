const { normalizar, respostaConfirmaExecucao, respostaCancelaExecucao } = require("./regimeParserService")

function clienteModel() {
  return require("../models/Cliente")
}

function operadorSequelize() {
  return require("sequelize").Op
}

const CAMPOS_CLIENTE = {
  nome: { rotulo: "nome", aliases: ["nome", "nome completo", "razao social", "razão social"], limite: 180 },
  cpf: { rotulo: "CPF", aliases: ["cpf"], digitos: 11 },
  cnpj: { rotulo: "CNPJ", aliases: ["cnpj"], digitos: 14, opcional: true },
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
  regime: { rotulo: "regime tributário", aliases: ["regime tributario", "regime tributário", "regime"], limite: 80, opcional: true },
  ramoAtividade: { rotulo: "ramo de atividade", aliases: ["ramo de atividade", "atividade", "ramo"], limite: 160, opcional: true },
  cnaePrincipal: { rotulo: "CNAE principal", aliases: ["cnae principal", "cnae"], limite: 20, opcional: true },
  inscricaoMunicipal: { rotulo: "inscrição municipal", aliases: ["inscricao municipal", "inscrição municipal", "im"], limite: 40, opcional: true },
  inscricaoEstadual: { rotulo: "inscrição estadual", aliases: ["inscricao estadual", "inscrição estadual", "ie"], limite: 40, opcional: true },
  situacaoEmpresa: { rotulo: "situação da empresa", aliases: ["situacao da empresa", "situação da empresa", "situacao", "situação", "status"], limite: 40, opcional: true },
  observacao: { rotulo: "observação", aliases: ["observacao", "observação"], limite: 2000, opcional: true },
}

const CAMPOS_NOVO_CLIENTE = ["nome", "cpf", "telefone"]

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

function proximoCampoNovo(dados) {
  return CAMPOS_NOVO_CLIENTE.find((campo) => !dados[campo]) || null
}

function rotuloCampo(campo) {
  return CAMPOS_CLIENTE[campo]?.rotulo || campo
}

function formatarValor(campo, valor) {
  if (campo === "cpf" && somenteDigitos(valor).length === 11) {
    const d = somenteDigitos(valor)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  return String(valor || "")
}

async function iniciarNovoCliente() {
  return respostaBase({
    resposta: "Vamos cadastrar um novo cliente. Qual é o nome completo? Você pode cancelar a qualquer momento.",
    acaoGuiadaPendente: { tipo: "cliente-novo", etapa: "coleta", dados: {}, proximoCampo: "nome" },
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
    const cliente = await Cliente.create({ ...pendente.dados, ativo: true, situacaoEmpresa: "Ativa", anotacoes: [], proximasAcoes: [], anexos: [] })
    return respostaBase({
      resposta: `Cliente ${cliente.nome} cadastrado com sucesso.`,
      acaoGuiadaConcluida: true,
      clienteIdConfirmado: cliente.id,
      clienteNomeConfirmado: cliente.nome,
      consulta: { tipo: "cliente-novo-concluido", titulo: `Cliente cadastrado — ${cliente.nome}`, resumo: "Cadastro criado após confirmação.", total: 1, itens: [{ clienteId: cliente.id, cliente: cliente.nome, status: "Ativo" }] },
    })
  }

  const campo = pendente.proximoCampo || proximoCampoNovo(pendente.dados || {})
  const validacao = validarCampo(campo, mensagem)
  if (validacao.erro) {
    return respostaBase({
      resposta: `${validacao.erro} Tente novamente ou diga “cancelar”.`,
      acaoGuiadaPendente: pendente,
      consulta: { tipo: "acao-guiada-cliente-novo", titulo: "Novo cliente", resumo: `Aguardando ${rotuloCampo(campo)}.`, total: 0, itens: [] },
    })
  }

  const dados = { ...(pendente.dados || {}), [campo]: validacao.valor }
  const proximo = proximoCampoNovo(dados)
  if (proximo) {
    return respostaBase({
      resposta: `${rotuloCampo(campo)} registrado. Agora informe ${rotuloCampo(proximo)}.`,
      acaoGuiadaPendente: { ...pendente, dados, proximoCampo: proximo },
      consulta: { tipo: "acao-guiada-cliente-novo", titulo: "Novo cliente", resumo: `Aguardando ${rotuloCampo(proximo)}.`, total: Object.keys(dados).length, itens: [] },
    })
  }

  const resumo = `Nome: ${dados.nome}; CPF: ${formatarValor("cpf", dados.cpf)}; telefone: ${dados.telefone}.`
  return respostaBase({
    resposta: `Revise o cadastro: ${resumo} Responda “confirmar” para criar o cliente ou “cancelar”. Nenhum cadastro foi criado ainda.`,
    acaoGuiadaPendente: { tipo: "cliente-novo", etapa: "confirmacao", dados },
    consulta: { tipo: "confirmacao-final-cliente-novo", titulo: "Confirmar novo cliente", resumo, total: 1, itens: [{ cliente: dados.nome, status: "Aguardando confirmação" }] },
  })
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
  intencaoNovoCliente,
  intencaoAtualizarCliente,
  campoNaMensagem,
}

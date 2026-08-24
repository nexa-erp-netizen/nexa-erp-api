const { Op } = require("sequelize")
const sequelize = require("../config/database")
const Cliente = require("../models/Cliente")
const IncidenteSistema = require("../models/IncidenteSistema")
const { prepararCorrecao } = require("./nexaCorrecaoAutonomaService")
const { detectarInconsistenciasCliente } = require("./nexaInconsistenciasService")

const CAMPOS_SENSIVEIS = /(senha|password|token|secret|chave|certificado|credencial|arquivo|anexo|conteudo|dadosCriptografados|cpf|cnpj|email|telefone|endereco)/i
const MODELOS_BLOQUEADOS = new Set(["Usuario", "CredencialAcessoFiscal", "CertificadoDigital", "GoogleDriveConexao", "ExecucaoAgenteNexa"])
const MODELOS_FORA_DO_CONTEXTO_CLIENTE = new Set(["ConversaNexa", "MensagemNexa", "MemoriaNexa", "VocabularioVozNexa", "IncidenteSistema", "PlanoCorrecaoNexa", "MelhoriaNexa", "AuditoriaIntegracaoChatGPT"])

function catalogoSistema() {
  return Object.values(sequelize.models)
    .filter((modelo) => !MODELOS_BLOQUEADOS.has(modelo.name))
    .map((modelo) => ({
      modulo: modelo.name,
      camposConsultaveis: Object.keys(modelo.rawAttributes || {}).filter((campo) => !CAMPOS_SENSIVEIS.test(campo)).slice(0, 35),
    }))
    .sort((a, b) => a.modulo.localeCompare(b.modulo))
}

function definicoesFerramentas() {
  return [
    { nome: "mapear_sistema", descricao: "Mostra módulos e campos consultáveis do ERP.", parametros: {} },
    { nome: "consultar_modulo", descricao: "Consulta registros de qualquer módulo autorizado do ERP sem alterar dados.", parametros: { modulo: "nome exato vindo do mapa", clienteId: "opcional", status: "opcional", termo: "opcional", limite: "1 a 50" } },
    { nome: "buscar_clientes", descricao: "Localiza clientes por nome.", parametros: { termo: "texto opcional" } },
    { nome: "contexto_completo_cliente", descricao: "Cruza cadastro e todos os módulos autorizados vinculados ao cliente. Use antes de concluir uma análise geral da situação de um cliente.", parametros: { clienteId: "opcional se houver cliente atual", nome: "opcional para localizar pelo nome" } },
    { nome: "detectar_inconsistencias_cliente", descricao: "Cruza Financeiro, serviços, DAS, Fiscal, movimentos e lançamentos do cliente e aponta divergências comprováveis. Não altera dados.", parametros: { clienteId: "opcional se houver cliente atual", nome: "opcional para localizar pelo nome" } },
    { nome: "listar_incidentes", descricao: "Lista incidentes abertos, todos ou um incidente específico.", parametros: { status: "abertos|todos", incidenteId: "opcional" } },
    { nome: "verificar_saude_sistema", descricao: "Verifica API, banco e incidentes recentes.", parametros: {} },
    { nome: "preparar_correcao_registro", descricao: "Prepara, mas não executa, uma correção operacional após investigar e comprovar a divergência. Restrita ao administrador e a campos seguros; valores e exclusões são proibidos.", parametros: { modelo: "módulo exato", registroId: "ID comprovado", alteracoes: "objeto com campos seguros", justificativa: "causa comprovada" } },
  ]
}

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function nomeCliente(cliente) {
  return cliente?.nome || cliente?.razaoSocial || cliente?.nomeFantasia || "Cliente"
}

function limparRegistro(registro) {
  const bruto = registro?.toJSON?.() || registro || {}
  return Object.fromEntries(Object.entries(bruto).filter(([campo]) => !CAMPOS_SENSIVEIS.test(campo)))
}

function resumirRegistro(registro) {
  const limpo = limparRegistro(registro)
  const camposUteis = ["id", "status", "tipo", "descricao", "obrigacao", "competencia", "vencimento", "valor", "data", "dataPagamento", "dataRecebimento", "origem", "situacao", "ativo", "portalBloqueado"]
  return Object.fromEntries(camposUteis.filter((campo) => limpo[campo] !== undefined && limpo[campo] !== null && limpo[campo] !== "").map((campo) => [campo, limpo[campo]]))
}

async function mapearSistema() {
  return { modulos: catalogoSistema(), somenteLeitura: true }
}

async function consultarModulo(argumentos, contexto) {
  const nome = String(argumentos?.modulo || "").trim()
  const modelo = sequelize.models[nome]
  if (!modelo || MODELOS_BLOQUEADOS.has(nome)) throw new Error("Módulo inexistente ou protegido")

  const limite = Math.max(1, Math.min(50, Number(argumentos?.limite) || 20))
  const campos = Object.keys(modelo.rawAttributes || {})
  const where = {}
  const clienteId = Number(argumentos?.clienteId || contexto?.clienteId)
  if (Number.isInteger(clienteId) && clienteId > 0 && campos.includes("clienteId")) where.clienteId = clienteId
  if (argumentos?.status && campos.includes("status")) where.status = String(argumentos.status).slice(0, 60)

  const termo = String(argumentos?.termo || "").trim()
  if (termo) {
    const pesquisaveis = ["nome", "cliente", "descricao", "obrigacao", "titulo", "competencia"].filter((campo) => campos.includes(campo))
    if (pesquisaveis.length) where[Op.or] = pesquisaveis.map((campo) => ({ [campo]: { [Op.iLike]: `%${termo.slice(0, 80)}%` } }))
  }

  if (contexto?.usuario?.perfil === "Cliente") {
    if (campos.includes("clienteId") && contexto.clienteId) where.clienteId = contexto.clienteId
    else if (campos.includes("cliente") && contexto.usuario.clienteVinculado) where.cliente = contexto.usuario.clienteVinculado
    else throw new Error("Este módulo não pode ser consultado pelo perfil Cliente")
  }

  const registros = await modelo.findAll({ where, order: campos.includes("updatedAt") ? [["updatedAt", "DESC"]] : undefined, limit: limite })
  return { modulo: nome, totalRetornado: registros.length, registros: registros.map(limparRegistro), somenteLeitura: true }
}

async function buscarClientes(argumentos, contexto) {
  const termo = normalizar(argumentos?.termo)
  let clientes = await Cliente.findAll({ order: [["nome", "ASC"]], limit: 100 })
  if (contexto?.usuario?.perfil === "Cliente") clientes = clientes.filter((item) => normalizar(nomeCliente(item)) === normalizar(contexto.usuario.clienteVinculado))
  if (termo) clientes = clientes.filter((item) => normalizar(nomeCliente(item)).includes(termo))
  return { total: clientes.length, clientes: clientes.slice(0, 30).map((item) => ({ id: item.id, nome: nomeCliente(item), situacao: item.situacaoEmpresa, portalBloqueado: Boolean(item.portalBloqueado) })) }
}

function abertoPeloStatus(status) {
  const texto = normalizar(status)
  if (!texto) return null
  return !/(pago|recebido|concluido|entregue|quitado|finalizado|cancelado|arquivado|resolvido)/.test(texto)
}

async function contextoCompletoCliente(argumentos, contexto) {
  let clienteId = Number(argumentos?.clienteId || contexto?.clienteId)
  let cliente = Number.isInteger(clienteId) && clienteId > 0 ? await Cliente.findByPk(clienteId) : null
  const nomeBuscado = normalizar(argumentos?.nome)
  if (!cliente && nomeBuscado) {
    const candidatos = await Cliente.findAll({ order: [["nome", "ASC"]], limit: 100 })
    cliente = candidatos.find((item) => normalizar(nomeCliente(item)).includes(nomeBuscado)) || null
    clienteId = Number(cliente?.id)
  }
  if (!cliente) return { encontrado: false, motivo: "Cliente não localizado" }
  if (contexto?.usuario?.perfil === "Cliente" && normalizar(contexto.usuario.clienteVinculado) !== normalizar(nomeCliente(cliente))) throw new Error("Cliente fora da permissão do usuário")

  const nome = nomeCliente(cliente)
  const modelos = Object.values(sequelize.models).filter((modelo) => {
    const campos = Object.keys(modelo.rawAttributes || {})
    return !MODELOS_BLOQUEADOS.has(modelo.name)
      && !MODELOS_FORA_DO_CONTEXTO_CLIENTE.has(modelo.name)
      && modelo.name !== "Cliente"
      && (campos.includes("clienteId") || campos.includes("cliente"))
  })

  const resultados = await Promise.all(modelos.map(async (modelo) => {
    const campos = Object.keys(modelo.rawAttributes || {})
    const where = campos.includes("clienteId") ? { clienteId } : { cliente: nome }
    try {
      const registros = await modelo.findAll({ where, order: campos.includes("updatedAt") ? [["updatedAt", "DESC"]] : undefined, limit: 20 })
      if (!registros.length) return null
      const limpos = registros.map(limparRegistro)
      const status = limpos.map((item) => item.status).filter(Boolean)
      return {
        modulo: modelo.name,
        quantidadeEncontrada: registros.length,
        abertos: status.filter((valor) => abertoPeloStatus(valor) === true).length,
        encerrados: status.filter((valor) => abertoPeloStatus(valor) === false).length,
        registros: registros.slice(0, 3).map(resumirRegistro),
        resultadoLimitado: registros.length >= 20,
      }
    } catch (error) {
      return { modulo: modelo.name, indisponivel: true, motivo: String(error.message || error).slice(0, 180) }
    }
  }))

  return {
    encontrado: true,
    cliente: limparRegistro(cliente),
    modulosComDados: resultados.filter(Boolean),
    modulosVerificados: modelos.map((modelo) => modelo.name),
    somenteLeitura: true,
  }
}

async function listarIncidentes(argumentos, contexto) {
  if (contexto?.usuario?.perfil !== "Administrador") throw new Error("Acesso restrito ao administrador")
  const id = Number(argumentos?.incidenteId)
  const where = Number.isInteger(id) && id > 0 ? { id } : (normalizar(argumentos?.status) === "todos" ? {} : { status: { [Op.notIn]: ["Corrigido", "Ignorado"] } })
  const itens = await IncidenteSistema.findAll({ where, order: [["ultimaOcorrenciaEm", "DESC"]], limit: 20 })
  return { total: itens.length, incidentes: itens.map((item) => ({ id: item.id, titulo: item.titulo, status: item.status, nivel: item.nivel, ocorrencias: item.ocorrencias, causa: item.causaProvavel || item.diagnostico, correcaoSugerida: item.correcaoSugerida, ultimaOcorrenciaEm: item.ultimaOcorrenciaEm })) }
}

async function detectarInconsistencias(argumentos, contexto) {
  if (contexto?.usuario?.perfil !== "Administrador") throw new Error("Acesso restrito ao administrador")
  let clienteId = Number(argumentos?.clienteId || contexto?.clienteId)
  let cliente = Number.isInteger(clienteId) && clienteId > 0 ? await Cliente.findByPk(clienteId) : null
  const nomeBuscado = normalizar(argumentos?.nome)
  if (!cliente && nomeBuscado) {
    const candidatos = await Cliente.findAll({ order: [["nome", "ASC"]], limit: 100 })
    cliente = candidatos.find((item) => normalizar(nomeCliente(item)).includes(nomeBuscado)) || null
    clienteId = Number(cliente?.id)
  }
  if (!cliente) throw new Error("Cliente não localizado para análise")
  return detectarInconsistenciasCliente({ clienteId, clienteNome: nomeCliente(cliente) })
}

async function verificarSaude(_argumentos, contexto) {
  if (contexto?.usuario?.perfil !== "Administrador") throw new Error("Acesso restrito ao administrador")
  const inicio = Date.now()
  await sequelize.authenticate()
  await sequelize.query("SELECT 1")
  const desde = new Date(Date.now() - 86400000)
  const [abertos, criticos, recentes] = await Promise.all([
    IncidenteSistema.count({ where: { status: { [Op.notIn]: ["Corrigido", "Ignorado"] } } }),
    IncidenteSistema.count({ where: { status: { [Op.notIn]: ["Corrigido", "Ignorado"] }, nivel: "Crítico" } }),
    IncidenteSistema.count({ where: { ultimaOcorrenciaEm: { [Op.gte]: desde } } }),
  ])
  return { api: "online", banco: "conectado", tempoRespostaMs: Date.now() - inicio, incidentesAbertos: abertos, incidentesCriticos: criticos, ocorrenciasUltimas24h: recentes }
}

async function prepararCorrecaoRegistro(argumentos, contexto) {
  const proposta = await prepararCorrecao({
    modelo: argumentos?.modelo,
    registroId: argumentos?.registroId,
    alteracoes: argumentos?.alteracoes,
    justificativa: argumentos?.justificativa,
    usuario: contexto?.usuario,
  })
  return { proposta, executada: false, exigeConfirmacao: true }
}

const EXECUTORES = { mapear_sistema: mapearSistema, consultar_modulo: consultarModulo, buscar_clientes: buscarClientes, contexto_completo_cliente: contextoCompletoCliente, detectar_inconsistencias_cliente: detectarInconsistencias, listar_incidentes: listarIncidentes, verificar_saude_sistema: verificarSaude, preparar_correcao_registro: prepararCorrecaoRegistro }

async function executarFerramenta(nome, argumentos, contexto) {
  const executor = EXECUTORES[nome]
  if (!executor) throw new Error(`Ferramenta não permitida: ${nome}`)
  return executor(argumentos || {}, contexto || {})
}

module.exports = { definicoesFerramentas, catalogoSistema, executarFerramenta }

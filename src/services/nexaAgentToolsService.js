const { Op } = require("sequelize")
const sequelize = require("../config/database")
const Cliente = require("../models/Cliente")
const IncidenteSistema = require("../models/IncidenteSistema")

const CAMPOS_SENSIVEIS = /(senha|password|token|secret|chave|certificado|credencial|arquivo|anexo|conteudo|dadosCriptografados|cpf|cnpj|email|telefone|endereco)/i
const MODELOS_BLOQUEADOS = new Set(["Usuario", "CredencialAcessoFiscal", "CertificadoDigital", "GoogleDriveConexao", "ExecucaoAgenteNexa"])

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
    { nome: "listar_incidentes", descricao: "Lista incidentes abertos, todos ou um incidente específico.", parametros: { status: "abertos|todos", incidenteId: "opcional" } },
    { nome: "verificar_saude_sistema", descricao: "Verifica API, banco e incidentes recentes.", parametros: {} },
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

async function listarIncidentes(argumentos, contexto) {
  if (contexto?.usuario?.perfil !== "Administrador") throw new Error("Acesso restrito ao administrador")
  const id = Number(argumentos?.incidenteId)
  const where = Number.isInteger(id) && id > 0 ? { id } : (normalizar(argumentos?.status) === "todos" ? {} : { status: { [Op.notIn]: ["Corrigido", "Ignorado"] } })
  const itens = await IncidenteSistema.findAll({ where, order: [["ultimaOcorrenciaEm", "DESC"]], limit: 20 })
  return { total: itens.length, incidentes: itens.map((item) => ({ id: item.id, titulo: item.titulo, status: item.status, nivel: item.nivel, ocorrencias: item.ocorrencias, causa: item.causaProvavel || item.diagnostico, correcaoSugerida: item.correcaoSugerida, ultimaOcorrenciaEm: item.ultimaOcorrenciaEm })) }
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

const EXECUTORES = { mapear_sistema: mapearSistema, consultar_modulo: consultarModulo, buscar_clientes: buscarClientes, listar_incidentes: listarIncidentes, verificar_saude_sistema: verificarSaude }

async function executarFerramenta(nome, argumentos, contexto) {
  const executor = EXECUTORES[nome]
  if (!executor) throw new Error(`Ferramenta não permitida: ${nome}`)
  return executor(argumentos || {}, contexto || {})
}

module.exports = { definicoesFerramentas, catalogoSistema, executarFerramenta }

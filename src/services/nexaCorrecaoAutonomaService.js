const crypto = require("crypto")
const sequelize = require("../config/database")
const PlanoCorrecaoNexa = require("../models/PlanoCorrecaoNexa")
const { validarProposta } = require("./nexaCorrecaoPolicyService")
const PRAZO_CONFIRMACAO_MS = Math.max(5, Math.min(60, Number(process.env.NEXA_CORRECAO_CONFIRMATION_MINUTES) || 15)) * 60 * 1000
const CONFIRMACOES = new Set([
  "sim", "confirmo", "confirmado", "autorizo", "pode corrigir", "pode fazer a correcao",
  "faca a correcao", "execute a correcao", "corrija", "sim pode corrigir", "sim corrija",
])
const CANCELAMENTOS = new Set(["nao", "cancelar", "cancele", "deixe", "agora nao", "nao corrija"])

function normalizarConfirmacao(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function intencaoConfirmacao(mensagem) {
  const texto = normalizarConfirmacao(mensagem)
  if (CONFIRMACOES.has(texto)) return "confirmar"
  if (CANCELAMENTOS.has(texto)) return "cancelar"
  return null
}

function resumoCampos(dados) {
  return Object.entries(dados).map(([campo, valor]) => `${campo}: ${valor ?? "vazio"}`).join("; ")
}

async function prepararCorrecao({ modelo, registroId, alteracoes, justificativa, usuario }) {
  if (usuario?.perfil !== "Administrador") throw new Error("Correção autônoma restrita ao administrador")
  const proposta = validarProposta({ modelo, registroId, alteracoes })
  const Model = sequelize.models[proposta.modelo]
  if (!Model) throw new Error("Módulo não carregado no sistema")
  const camposModelo = Object.keys(Model.rawAttributes || {})
  for (const campo of Object.keys(proposta.alteracoes)) if (!camposModelo.includes(campo)) throw new Error(`O módulo não possui o campo ${campo}`)
  const registro = await Model.findByPk(proposta.registroId)
  if (!registro) throw new Error("Registro não encontrado")
  const anterior = Object.fromEntries(Object.keys(proposta.alteracoes).map((campo) => [campo, registro[campo] ?? null]))
  const mudancas = Object.fromEntries(Object.entries(proposta.alteracoes).filter(([campo, valor]) => String(anterior[campo] ?? "") !== String(valor ?? "")))
  if (!Object.keys(mudancas).length) throw new Error("O registro já possui os valores propostos")
  const fingerprint = crypto.createHash("sha256").update(`${proposta.modelo}:${proposta.registroId}:${JSON.stringify(mudancas)}`).digest("hex")
  const existente = await PlanoCorrecaoNexa.findOne({
    where: { fingerprint, usuarioId: usuario.id, status: "Aguardando confirmação" },
    order: [["createdAt", "DESC"]],
  })
  if (existente && (Date.now() - new Date(existente.createdAt).getTime()) <= PRAZO_CONFIRMACAO_MS) {
    return {
      planoId: existente.id,
      modelo: proposta.modelo,
      registroId: proposta.registroId,
      anterior,
      alteracoes: mudancas,
      justificativa: existente.diagnostico,
      resumo: `${proposta.modelo} #${proposta.registroId}: ${resumoCampos(anterior)} → ${resumoCampos(mudancas)}`,
      reutilizado: true,
    }
  }
  const plano = await PlanoCorrecaoNexa.create({
    fingerprint,
    titulo: `Correção assistida em ${proposta.modelo} #${proposta.registroId}`,
    status: "Aguardando confirmação",
    diagnostico: String(justificativa || "Inconsistência identificada após cruzamento dos dados.").slice(0, 1500),
    causaRaiz: String(justificativa || "Dados operacionais divergentes entre módulos.").slice(0, 1500),
    escopo: { modelo: proposta.modelo, registroId: proposta.registroId, alteracoes: mudancas, estadoAnterior: anterior },
    etapas: ["Preservar estado anterior", "Alterar em transação", "Reler o registro", "Validar os campos", "Registrar o resultado"],
    testesPrevistos: Object.entries(mudancas).map(([campo, valor]) => `${campo} deve ser ${valor ?? "vazio"}`),
    rollback: `Restaurar ${resumoCampos(anterior)} no mesmo registro.`,
    risco: "Médio",
    exigeConfirmacao: true,
    usuarioId: usuario.id,
  })
  return {
    planoId: plano.id,
    modelo: proposta.modelo,
    registroId: proposta.registroId,
    anterior,
    alteracoes: mudancas,
    justificativa: plano.diagnostico,
    resumo: `${proposta.modelo} #${proposta.registroId}: ${resumoCampos(anterior)} → ${resumoCampos(mudancas)}`,
  }
}

async function executarPlano({ planoId, usuario }) {
  if (usuario?.perfil !== "Administrador") throw new Error("Correção autônoma restrita ao administrador")
  const plano = await PlanoCorrecaoNexa.findByPk(Number(planoId))
  if (!plano || plano.status !== "Aguardando confirmação") throw new Error("Plano indisponível ou já processado")
  if (Number(plano.usuarioId) !== Number(usuario.id)) throw new Error("Este plano pertence a outro usuário")
  if ((Date.now() - new Date(plano.createdAt).getTime()) > PRAZO_CONFIRMACAO_MS) {
    await plano.update({ status: "Expirado" })
    throw new Error("A confirmação expirou. Peça uma nova análise antes de corrigir")
  }
  const { modelo, registroId, alteracoes, estadoAnterior } = plano.escopo || {}
  const proposta = validarProposta({ modelo, registroId, alteracoes })
  const Model = sequelize.models[proposta.modelo]
  if (!Model) throw new Error("Módulo não carregado")
  return sequelize.transaction(async (transaction) => {
    const registro = await Model.findByPk(proposta.registroId, { transaction, lock: transaction.LOCK.UPDATE })
    if (!registro) throw new Error("Registro não encontrado durante a validação")
    for (const [campo, anterior] of Object.entries(estadoAnterior || {})) {
      if (String(registro[campo] ?? "") !== String(anterior ?? "")) throw new Error(`O campo ${campo} mudou depois do diagnóstico; prepare uma nova análise`)
    }
    await registro.update(proposta.alteracoes, { transaction })
    await registro.reload({ transaction })
    const falhas = Object.entries(proposta.alteracoes).filter(([campo, valor]) => String(registro[campo] ?? "") !== String(valor ?? ""))
    if (falhas.length) throw new Error(`A validação falhou em: ${falhas.map(([campo]) => campo).join(", ")}`)
    const resultado = { validado: true, modelo: proposta.modelo, registroId: proposta.registroId, campos: proposta.alteracoes, validadoEm: new Date().toISOString() }
    await plano.update({ status: "Concluído", aprovadoEm: new Date(), executadoEm: new Date(), resultadoTestes: resultado }, { transaction })
    return resultado
  })
}

async function responderConfirmacaoPlano({ mensagem, planoPendente, usuario }) {
  if (!planoPendente?.planoId) return null
  const intencao = intencaoConfirmacao(mensagem)
  if (intencao === "cancelar") {
    await PlanoCorrecaoNexa.update({ status: "Cancelado" }, { where: { id: planoPendente.planoId, usuarioId: usuario.id, status: "Aguardando confirmação" } })
    return { resposta: "Correção cancelada. Nenhum dado foi alterado.", modo: "nexa-correcao-autonoma", correcaoCancelada: true }
  }
  if (intencao !== "confirmar") return null
  const resultado = await executarPlano({ planoId: planoPendente.planoId, usuario })
  return { resposta: "Correção concluída e conferida. O registro foi atualizado conforme você autorizou, sem alterar valores financeiros.", modo: "nexa-correcao-autonoma", correcaoExecutada: resultado }
}

module.exports = { prepararCorrecao, executarPlano, responderConfirmacaoPlano, intencaoConfirmacao, PRAZO_CONFIRMACAO_MS }

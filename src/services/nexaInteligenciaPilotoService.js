const sequelize = require("../config/database")
const NexaInteligenciaPiloto = require("../models/NexaInteligenciaPiloto")
const { usuarioAtual } = require("./nexaInteligenciaPilotoContext")

const DIAS_PILOTO = 30
const LIMITE_USD = Number(process.env.NEXA_OPENAI_PILOT_LIMIT_USD || 10)
const CUSTO_ENTRADA_MILHAO = Number(process.env.OPENAI_INPUT_USD_PER_MILLION || 2.5)
const CUSTO_SAIDA_MILHAO = Number(process.env.OPENAI_OUTPUT_USD_PER_MILLION || 15)

function chaveEscritorio(usuario) {
  return usuario?.escritorioId || null
}

function exigirAdministrador() {
  const usuario = usuarioAtual()
  if (String(usuario?.perfil || "").toLowerCase() !== "administrador") {
    const error = new Error("O piloto da Nexa Inteligência é exclusivo do administrador.")
    error.statusCode = 403
    throw error
  }
  return usuario
}

function estimarTokens(texto) {
  return Math.max(1, Math.ceil(String(texto || "").length / 3))
}

function custoUsd(tokensEntrada, tokensSaida) {
  return (Number(tokensEntrada || 0) * CUSTO_ENTRADA_MILHAO + Number(tokensSaida || 0) * CUSTO_SAIDA_MILHAO) / 1_000_000
}

async function obterOuCriar(transaction, usuario) {
  const escritorioId = chaveEscritorio(usuario)
  let registro = await NexaInteligenciaPiloto.findOne({ where: { escritorioId }, transaction, lock: transaction.LOCK.UPDATE })
  if (!registro) {
    const iniciadoEm = new Date()
    const encerraEm = new Date(iniciadoEm.getTime() + DIAS_PILOTO * 24 * 60 * 60 * 1000)
    registro = await NexaInteligenciaPiloto.create({ escritorioId, iniciadoEm, encerraEm, limiteUsd: LIMITE_USD }, { transaction })
  }
  return registro
}

async function reservar({ mensagens, maxTokens }) {
  const usuario = exigirAdministrador()
  const estimativa = custoUsd(estimarTokens(JSON.stringify(mensagens)), Number(maxTokens || 900))
  return sequelize.transaction(async (transaction) => {
    const registro = await obterOuCriar(transaction, usuario)
    if (Date.now() >= new Date(registro.encerraEm).getTime()) {
      const error = new Error("O piloto de 30 dias da Nexa Inteligência foi encerrado.")
      error.statusCode = 402
      error.pilotLimit = true
      throw error
    }
    const consumido = Number(registro.consumidoUsd || 0)
    const limite = Number(registro.limiteUsd || LIMITE_USD)
    if (consumido + estimativa > limite) {
      const error = new Error("O limite de US$ 10 do piloto foi atingido. Nenhuma nova chamada à OpenAI foi realizada.")
      error.statusCode = 402
      error.pilotLimit = true
      throw error
    }
    registro.consumidoUsd = consumido + estimativa
    await registro.save({ transaction })
    return { id: registro.id, reservadoUsd: estimativa }
  })
}

async function finalizar(reserva, usage = {}) {
  if (!reserva?.id) return
  const entrada = usage.input_tokens ?? usage.prompt_tokens ?? 0
  const saida = usage.output_tokens ?? usage.completion_tokens ?? 0
  const real = custoUsd(entrada, saida)
  await sequelize.transaction(async (transaction) => {
    const registro = await NexaInteligenciaPiloto.findByPk(reserva.id, { transaction, lock: transaction.LOCK.UPDATE })
    if (!registro) return
    registro.consumidoUsd = Math.min(Number(registro.limiteUsd), Math.max(0, Number(registro.consumidoUsd) - reserva.reservadoUsd + real))
    registro.chamadas = Number(registro.chamadas || 0) + 1
    await registro.save({ transaction })
  })
}

async function liberar(reserva) {
  if (!reserva?.id) return
  await sequelize.transaction(async (transaction) => {
    const registro = await NexaInteligenciaPiloto.findByPk(reserva.id, { transaction, lock: transaction.LOCK.UPDATE })
    if (!registro) return
    registro.consumidoUsd = Math.max(0, Number(registro.consumidoUsd) - reserva.reservadoUsd)
    await registro.save({ transaction })
  })
}

async function status(usuario) {
  if (String(usuario?.perfil || "").toLowerCase() !== "administrador") return { permitido: false }
  const registro = await NexaInteligenciaPiloto.findOne({ where: { escritorioId: chaveEscritorio(usuario) } })
  if (!registro) return { permitido: true, ativo: true, iniciado: false, dias: DIAS_PILOTO, limiteUsd: LIMITE_USD, consumidoUsd: 0, restanteUsd: LIMITE_USD, chamadas: 0 }
  const limiteUsd = Number(registro.limiteUsd)
  const consumidoUsd = Number(registro.consumidoUsd)
  return {
    permitido: true,
    ativo: Date.now() < new Date(registro.encerraEm).getTime() && consumidoUsd < limiteUsd,
    iniciado: true,
    iniciadoEm: registro.iniciadoEm,
    encerraEm: registro.encerraEm,
    limiteUsd,
    consumidoUsd,
    restanteUsd: Math.max(0, limiteUsd - consumidoUsd),
    chamadas: Number(registro.chamadas || 0),
  }
}

module.exports = { reservar, finalizar, liberar, status, _test: { estimarTokens, custoUsd } }

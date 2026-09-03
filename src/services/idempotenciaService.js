const crypto = require("crypto")

function dependenciasBanco() {
  const { Op } = require("sequelize")
  const IdempotenciaOperacao = require("../models/IdempotenciaOperacao")
  return { Op, IdempotenciaOperacao }
}

function hashDaChave(chave) {
  return crypto
    .createHash("sha256")
    .update(String(chave || ""))
    .digest("hex")
}

async function limparIdempotenciasExpiradas() {
  const { Op, IdempotenciaOperacao } = dependenciasBanco()

  return IdempotenciaOperacao.destroy({
    where: {
      expiraEm: {
        [Op.lte]: new Date(),
      },
    },
  })
}

async function buscarIdempotenciaAtiva(chave) {
  if (!chave) return null

  const { Op, IdempotenciaOperacao } = dependenciasBanco()

  return IdempotenciaOperacao.findOne({
    where: {
      chaveHash: hashDaChave(chave),
      expiraEm: {
        [Op.gt]: new Date(),
      },
    },
  })
}

async function iniciarIdempotencia({
  chave,
  tipo,
  ttlMs,
  transaction,
}) {
  const { IdempotenciaOperacao } = dependenciasBanco()
  const ttl = Math.max(1000, Number(ttlMs || 0))

  return IdempotenciaOperacao.create({
    chaveHash: hashDaChave(chave),
    tipo: tipo || "movimento-cliente",
    resposta: null,
    expiraEm: new Date(Date.now() + ttl),
  }, { transaction })
}

async function concluirIdempotencia(registro, resposta, transaction) {
  if (!registro) return

  await registro.update({
    resposta: resposta || null,
  }, { transaction })
}

function ehConflitoDeIdempotencia(error) {
  if (error?.name !== "SequelizeUniqueConstraintError") return false

  const campos = error?.fields || {}
  if (Object.prototype.hasOwnProperty.call(campos, "chaveHash")) return true

  return Array.isArray(error?.errors) && error.errors.some(
    item => item?.path === "chaveHash"
  )
}

function respostaPersistida(registro) {
  const resposta = registro?.resposta

  if (!resposta || typeof resposta !== "object") {
    return null
  }

  return resposta
}

module.exports = {
  hashDaChave,
  limparIdempotenciasExpiradas,
  buscarIdempotenciaAtiva,
  iniciarIdempotencia,
  concluirIdempotencia,
  ehConflitoDeIdempotencia,
  respostaPersistida,
}

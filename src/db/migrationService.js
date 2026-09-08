const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const TABELA_MIGRACOES = "schema_migrations"
const DIRETORIO_PADRAO = path.join(__dirname, "migrations")
const LOCK_MIGRACOES_ID = 93550001
const LOCK_MIGRACOES_TIMEOUT_MS = 120000
const LOCK_MIGRACOES_INTERVALO_MS = 500

function normalizarNomeTabela(valor) {
  if (!valor) return ""
  if (typeof valor === "string") return valor
  return valor.tableName || valor.name || String(valor)
}

function listarArquivosMigracao(diretorio = DIRETORIO_PADRAO) {
  if (!fs.existsSync(diretorio)) return []

  return fs
    .readdirSync(diretorio)
    .filter(nome => /^\d{12,}[-_].+\.js$/i.test(nome))
    .sort((a, b) => a.localeCompare(b))
    .map(nome => path.join(diretorio, nome))
}

function checksumArquivo(arquivo) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(arquivo))
    .digest("hex")
}

function validarChecksumAplicado(registro, checksumAtual, nomeMigracao) {
  if (!registro) return "pendente"

  if (registro.checksum !== checksumAtual) {
    throw new Error(
      `Migration já aplicada foi alterada: ${nomeMigracao}. ` +
      "Crie uma nova migration em vez de editar uma migration já executada."
    )
  }

  return "aplicada"
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

function lockAdquirido(resposta) {
  return resposta?.rows?.[0]?.acquired === true || resposta?.rows?.[0]?.acquired === "t"
}

async function adquirirLockMigracoes(sequelize, opcoes = {}) {
  const dialecto = typeof sequelize?.getDialect === "function" ? sequelize.getDialect() : ""
  if (dialecto !== "postgres" || !sequelize?.connectionManager?.getConnection) {
    return async () => {}
  }

  const timeoutMs = Number(opcoes.timeoutMs ?? LOCK_MIGRACOES_TIMEOUT_MS)
  const intervaloMs = Number(opcoes.intervaloMs ?? LOCK_MIGRACOES_INTERVALO_MS)
  const connection = await sequelize.connectionManager.getConnection({ type: "WRITE" })
  const inicio = Date.now()
  let adquirido = false

  try {
    while (!adquirido) {
      const resposta = await connection.query(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        [LOCK_MIGRACOES_ID]
      )
      adquirido = lockAdquirido(resposta)
      if (adquirido) break

      if (Date.now() - inicio >= timeoutMs) {
        throw new Error(
          `Tempo limite excedido aguardando o lock de migrations (${timeoutMs} ms). ` +
          "Outra instância da API pode estar atualizando o banco."
        )
      }

      await esperar(intervaloMs)
    }
  } catch (error) {
    await sequelize.connectionManager.releaseConnection(connection)
    throw error
  }

  let liberado = false
  return async () => {
    if (liberado) return
    liberado = true
    try {
      await connection.query(
        "SELECT pg_advisory_unlock($1) AS released",
        [LOCK_MIGRACOES_ID]
      )
    } finally {
      await sequelize.connectionManager.releaseConnection(connection)
    }
  }
}

async function garantirTabelaMigracoes(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "${TABELA_MIGRACOES}" (
      "name" VARCHAR(255) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "executionMs" INTEGER NOT NULL DEFAULT 0
    )
  `)
}

async function lerMigracoesAplicadas(sequelize) {
  const [linhas] = await sequelize.query(
    `SELECT "name", "checksum", "appliedAt", "executionMs" FROM "${TABELA_MIGRACOES}" ORDER BY "name" ASC`
  )

  return new Map((linhas || []).map(item => [item.name, item]))
}

async function bancoAplicacaoEstaVazio(sequelize) {
  const queryInterface = sequelize.getQueryInterface()
  const tabelas = await queryInterface.showAllTables()
  const nomes = (tabelas || []).map(normalizarNomeTabela)
  const ignoradas = new Set([TABELA_MIGRACOES, "SequelizeMeta"])

  return nomes.filter(nome => nome && !ignoradas.has(nome)).length === 0
}

async function bootstrapSomenteBancoVazio(sequelize) {
  const vazio = await bancoAplicacaoEstaVazio(sequelize)
  if (!vazio) return false

  // Bootstrap permitido apenas em banco realmente vazio. Sem alter/force:
  // cria o esquema inicial, mas nunca modifica tabelas existentes.
  await sequelize.sync({ force: false, alter: false })
  return true
}

async function executarMigracoes(sequelize, opcoes = {}) {
  const diretorio = opcoes.diretorio || DIRETORIO_PADRAO

  await sequelize.authenticate()
  const liberarLock = await adquirirLockMigracoes(sequelize, opcoes.lock)

  try {
    await garantirTabelaMigracoes(sequelize)
    const bootstrap = await bootstrapSomenteBancoVazio(sequelize)

    const aplicadasAntes = await lerMigracoesAplicadas(sequelize)
    const arquivos = listarArquivosMigracao(diretorio)
    const resultado = {
      bootstrap,
      total: arquivos.length,
      aplicadas: 0,
      jaAplicadas: 0,
      nomesAplicadas: [],
    }

    for (const arquivo of arquivos) {
      const nomeArquivo = path.basename(arquivo)
      const checksum = checksumArquivo(arquivo)
      const registro = aplicadasAntes.get(nomeArquivo)
      const status = validarChecksumAplicado(registro, checksum, nomeArquivo)

      if (status === "aplicada") {
        resultado.jaAplicadas += 1
        continue
      }

      delete require.cache[require.resolve(arquivo)]
      const migration = require(arquivo)
      if (!migration || typeof migration.up !== "function") {
        throw new Error(`Migration inválida: ${nomeArquivo}. É obrigatório exportar up().`)
      }

      const inicio = Date.now()

      await sequelize.transaction(async transaction => {
        await migration.up({
          sequelize,
          queryInterface: sequelize.getQueryInterface(),
          transaction,
        })

        await sequelize.query(
          `INSERT INTO "${TABELA_MIGRACOES}" ("name", "checksum", "appliedAt", "executionMs") VALUES (:name, :checksum, NOW(), :executionMs)`,
          {
            replacements: {
              name: nomeArquivo,
              checksum,
              executionMs: Math.max(0, Date.now() - inicio),
            },
            transaction,
          }
        )
      })

      resultado.aplicadas += 1
      resultado.nomesAplicadas.push(nomeArquivo)
    }

    return resultado
  } finally {
    await liberarLock()
  }
}

module.exports = {
  TABELA_MIGRACOES,
  LOCK_MIGRACOES_ID,
  normalizarNomeTabela,
  listarArquivosMigracao,
  checksumArquivo,
  validarChecksumAplicado,
  lockAdquirido,
  adquirirLockMigracoes,
  executarMigracoes,
  bancoAplicacaoEstaVazio,
}

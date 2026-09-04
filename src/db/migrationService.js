const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const TABELA_MIGRACOES = "schema_migrations"
const DIRETORIO_PADRAO = path.join(__dirname, "migrations")

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
}

module.exports = {
  TABELA_MIGRACOES,
  normalizarNomeTabela,
  listarArquivosMigracao,
  checksumArquivo,
  validarChecksumAplicado,
  executarMigracoes,
  bancoAplicacaoEstaVazio,
}

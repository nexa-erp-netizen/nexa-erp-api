const test = require("node:test")
const assert = require("node:assert/strict")

const {
  BACKUP_TYPE,
  BACKUP_SCHEMA_VERSION,
  checksumTabela,
  checksumBackup,
  validarBackup,
} = require("../src/services/backupSistemaService")

function exemploBackup() {
  const backup = {
    sistema: "Nexa ERP",
    tipo: BACKUP_TYPE,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    versaoAplicacao: "3.53.0",
    escritorioId: 7,
    geradoEm: "2026-09-03T18:00:00.000Z",
    origem: "manual",
    dados: {
      Cliente: [{ id: 1, escritorioId: 7, nome: "Empresa A" }],
      MovimentoCliente: [{ id: 2, escritorioId: 7, valor: "10.00" }],
    },
  }

  backup.checksumsTabelas = {
    Cliente: checksumTabela(backup.dados.Cliente),
    MovimentoCliente: checksumTabela(backup.dados.MovimentoCliente),
  }
  backup.checksumSha256 = checksumBackup(backup)
  return backup
}

test("valida backup íntegro do mesmo escritório", () => {
  const resultado = validarBackup(exemploBackup(), {
    escritorioId: 7,
    modelosDisponiveis: ["Cliente", "MovimentoCliente"],
  })

  assert.equal(resultado.valido, true)
  assert.equal(resultado.restauravel, true)
  assert.equal(resultado.totalRegistros, 2)
})

test("bloqueia backup de outro escritório", () => {
  const resultado = validarBackup(exemploBackup(), {
    escritorioId: 8,
    modelosDisponiveis: ["Cliente", "MovimentoCliente"],
  })

  assert.equal(resultado.restauravel, false)
  assert.match(resultado.erros.join(" "), /outro escritório/i)
})

test("detecta alteração no conteúdo pelo checksum", () => {
  const backup = exemploBackup()
  backup.dados.Cliente[0].nome = "Alterado"

  const resultado = validarBackup(backup, {
    escritorioId: 7,
    modelosDisponiveis: ["Cliente", "MovimentoCliente"],
  })

  assert.equal(resultado.restauravel, false)
  assert.match(resultado.erros.join(" "), /checksum/i)
})

test("não restaura backup legado automaticamente", () => {
  const resultado = validarBackup({ tipo: "backup-json", dados: {} }, {
    escritorioId: 7,
    modelosDisponiveis: [],
  })

  assert.equal(resultado.legado, true)
  assert.equal(resultado.restauravel, false)
})

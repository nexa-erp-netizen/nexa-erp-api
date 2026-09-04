const crypto = require("crypto")

const BACKUP_SCHEMA_VERSION = 2
const BACKUP_TYPE = "backup-json-v2"

function sha256(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest("hex")
}

function checksumTabela(registros) {
  return sha256(JSON.stringify(Array.isArray(registros) ? registros : []))
}

function checksumBackup(conteudo = {}) {
  return sha256(JSON.stringify({
    schemaVersion: conteudo.schemaVersion,
    escritorioId: conteudo.escritorioId,
    dados: conteudo.dados || {},
  }))
}

function validarBackup(conteudo, { escritorioId, modelosDisponiveis = [] } = {}) {
  const erros = []
  const avisos = []

  if (!conteudo || typeof conteudo !== "object" || Array.isArray(conteudo)) {
    return {
      valido: false,
      restauravel: false,
      erros: ["Arquivo de backup inválido ou corrompido"],
      avisos,
    }
  }

  if (conteudo.tipo !== BACKUP_TYPE || Number(conteudo.schemaVersion) !== BACKUP_SCHEMA_VERSION) {
    return {
      valido: false,
      restauravel: false,
      legado: true,
      erros: ["Backup legado: disponível para download, mas não para restauração automática"],
      avisos,
    }
  }

  if (!conteudo.dados || typeof conteudo.dados !== "object" || Array.isArray(conteudo.dados)) {
    erros.push("Estrutura de tabelas ausente")
  }

  if (escritorioId != null && String(conteudo.escritorioId) !== String(escritorioId)) {
    erros.push("Este backup pertence a outro escritório")
  }

  const nomesBackup = Object.keys(conteudo.dados || {}).sort()
  const nomesDisponiveis = [...modelosDisponiveis].sort()
  const disponiveis = new Set(nomesDisponiveis)
  const presentes = new Set(nomesBackup)

  const desconhecidos = nomesBackup.filter((nome) => !disponiveis.has(nome))
  const faltantes = nomesDisponiveis.filter((nome) => !presentes.has(nome))

  if (desconhecidos.length) {
    erros.push(`Tabelas não reconhecidas nesta versão: ${desconhecidos.join(", ")}`)
  }

  if (faltantes.length) {
    erros.push(`Backup incompleto para esta versão. Faltam: ${faltantes.join(", ")}`)
  }

  for (const nome of nomesBackup) {
    const registros = conteudo.dados?.[nome]

    if (!Array.isArray(registros)) {
      erros.push(`Conteúdo inválido na tabela ${nome}`)
      continue
    }

    for (const registro of registros) {
      if (!registro || typeof registro !== "object" || Array.isArray(registro)) {
        erros.push(`Registro inválido na tabela ${nome}`)
        break
      }

      if (escritorioId != null && String(registro.escritorioId) !== String(escritorioId)) {
        erros.push(`A tabela ${nome} contém registro de outro escritório`)
        break
      }
    }

    const checksumEsperado = conteudo.checksumsTabelas?.[nome]
    if (!checksumEsperado) {
      erros.push(`Checksum ausente para a tabela ${nome}`)
    } else if (checksumEsperado !== checksumTabela(registros)) {
      erros.push(`Checksum divergente na tabela ${nome}`)
    }
  }

  const checksumCalculado = checksumBackup(conteudo)
  if (!conteudo.checksumSha256) {
    erros.push("Checksum geral ausente")
  } else if (conteudo.checksumSha256 !== checksumCalculado) {
    erros.push("Checksum geral divergente: o arquivo pode ter sido alterado ou corrompido")
  }

  if (conteudo.versaoAplicacao && conteudo.versaoAplicacao !== "3.53.0") {
    avisos.push(`Backup gerado na versão ${conteudo.versaoAplicacao}; a estrutura foi validada antes da restauração`)
  }

  const totalRegistros = nomesBackup.reduce(
    (total, nome) => total + (Array.isArray(conteudo.dados?.[nome]) ? conteudo.dados[nome].length : 0),
    0
  )

  return {
    valido: erros.length === 0,
    restauravel: erros.length === 0,
    erros,
    avisos,
    tipo: conteudo.tipo,
    schemaVersion: conteudo.schemaVersion,
    sistema: conteudo.sistema,
    versaoAplicacao: conteudo.versaoAplicacao,
    geradoEm: conteudo.geradoEm,
    origem: conteudo.origem,
    escritorioId: conteudo.escritorioId,
    totalTabelas: nomesBackup.length,
    totalRegistros,
    resumo: conteudo.resumo || null,
    checksumSha256: conteudo.checksumSha256 || null,
  }
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  BACKUP_TYPE,
  sha256,
  checksumTabela,
  checksumBackup,
  validarBackup,
}

const express = require("express")
const fs = require("fs")
const path = require("path")
const { Transaction } = require("sequelize")
const { autenticar } = require("../middlewares/authMiddleware")
const sequelize = require("../config/database")
const supabase = require("../config/supabase")
const AuditoriaBackup = require("../models/AuditoriaBackup")
const {
  BACKUP_SCHEMA_VERSION,
  BACKUP_TYPE,
  checksumTabela,
  checksumBackup,
  validarBackup,
} = require("../services/backupSistemaService")

const router = express.Router()
const BUCKET_BACKUP = process.env.SUPABASE_BACKUP_BUCKET || "backup-sistema"
const MODELOS_EXCLUIDOS = new Set(["IdempotenciaOperacao"])
const FRASE_CONFIRMACAO = "RESTAURAR"

function somenteAdmin(req, res, next) {
  if (!req.usuario || req.usuario.perfil !== "Administrador") {
    return res.status(403).json({ message: "Acesso negado" })
  }

  next()
}

function pastaBackups() {
  const pasta = path.resolve(__dirname, "../../backups")

  if (!fs.existsSync(pasta)) {
    fs.mkdirSync(pasta, { recursive: true })
  }

  return pasta
}

function nomeBackup(prefixo = "backup-nexa") {
  const data = new Date().toISOString().replace(/[:.]/g, "-")
  return `${prefixo}-${data}.json`
}

function modelosBackup() {
  return Object.values(sequelize.models)
    .filter((Model) => Model?.rawAttributes?.escritorioId)
    .filter((Model) => !MODELOS_EXCLUIDOS.has(Model.name))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function modelosPorNome() {
  return new Map(modelosBackup().map((Model) => [Model.name, Model]))
}

function nomesModelosBackup() {
  return modelosBackup().map((Model) => Model.name)
}

function orderPorPk(Model) {
  const pk = Model.primaryKeyAttribute
  return pk ? [[pk, "ASC"]] : undefined
}

async function garantirBucketBackup() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return false
  }

  const { data: bucket } = await supabase.storage.getBucket(BUCKET_BACKUP)

  if (bucket) return true

  const { error } = await supabase.storage.createBucket(BUCKET_BACKUP, {
    public: false,
  })

  if (error && !String(error.message || "").includes("already exists")) {
    throw error
  }

  return true
}

async function montarBackup({ origem = "manual", escritorioId, usuario = null } = {}) {
  if (!escritorioId) {
    throw new Error("Escritório não identificado para o backup")
  }

  const dados = {}
  const resumoTabelas = {}
  const checksumsTabelas = {}

  await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    readOnly: true,
  }, async (transaction) => {
    for (const Model of modelosBackup()) {
      const registros = await Model.findAll({
        where: { escritorioId },
        raw: true,
        order: orderPorPk(Model),
        transaction,
        semIsolamentoEscritorio: true,
      })

      dados[Model.name] = registros
      resumoTabelas[Model.name] = registros.length
      checksumsTabelas[Model.name] = checksumTabela(registros)
    }
  })

  const totalRegistros = Object.values(resumoTabelas).reduce((total, qtd) => total + qtd, 0)
  const conteudo = {
    sistema: "Nexa ERP",
    tipo: BACKUP_TYPE,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    versaoAplicacao: require("../../package.json").version,
    origem,
    escritorioId,
    geradoEm: new Date().toISOString(),
    geradoPor: usuario
      ? {
          id: usuario.id || null,
          email: usuario.email || null,
        }
      : null,
    resumo: {
      totalTabelas: Object.keys(resumoTabelas).length,
      totalRegistros,
      tabelas: resumoTabelas,
    },
    checksumsTabelas,
    dados,
  }

  conteudo.checksumSha256 = checksumBackup(conteudo)
  return conteudo
}

async function registrarAuditoria({
  req,
  acao,
  arquivo = null,
  origem = null,
  status,
  checksum = null,
  backupSeguranca = null,
  detalhes = null,
}) {
  try {
    await AuditoriaBackup.create({
      escritorioId: req.usuario?.escritorioId || null,
      acao,
      arquivo,
      origem,
      status,
      usuarioId: req.usuario?.id || null,
      usuarioEmail: req.usuario?.email || null,
      checksum,
      backupSeguranca,
      detalhes,
    }, {
      semIsolamentoEscritorio: true,
    })
  } catch (error) {
    console.error("ERRO AO REGISTRAR AUDITORIA DE BACKUP:", error)
  }
}

async function enviarSupabase(arquivo, json) {
  let enviadoSupabase = false
  let supabaseErro = null

  try {
    const podeUsarSupabase = await garantirBucketBackup()

    if (podeUsarSupabase) {
      const { error } = await supabase.storage
        .from(BUCKET_BACKUP)
        .upload(arquivo, Buffer.from(json, "utf-8"), {
          contentType: "application/json",
          upsert: true,
        })

      if (error) throw error
      enviadoSupabase = true
    }
  } catch (error) {
    supabaseErro = error.message
    console.error("ERRO AO ENVIAR BACKUP PARA SUPABASE:", error)
  }

  return { enviadoSupabase, supabaseErro }
}

async function salvarBackup({ origem = "manual", req, prefixo = "backup-nexa", auditar = true } = {}) {
  const escritorioId = req.usuario?.escritorioId
  const arquivo = nomeBackup(prefixo)
  const conteudo = await montarBackup({
    origem,
    escritorioId,
    usuario: req.usuario,
  })
  const json = JSON.stringify(conteudo, null, 2)
  const caminho = path.join(pastaBackups(), arquivo)

  fs.writeFileSync(caminho, json, "utf-8")
  const { enviadoSupabase, supabaseErro } = await enviarSupabase(arquivo, json)

  if (auditar) {
    await registrarAuditoria({
      req,
      acao: "GERAR_BACKUP",
      arquivo,
      origem,
      status: enviadoSupabase ? "SUCESSO_SUPABASE" : "SUCESSO_LOCAL",
      checksum: conteudo.checksumSha256,
      detalhes: conteudo.resumo,
    })
  }

  return {
    message: enviadoSupabase
      ? "Backup íntegro gerado e enviado ao Supabase com sucesso"
      : "Backup íntegro gerado localmente. O envio ao Supabase não ficou disponível.",
    arquivo,
    formato: "json-v2",
    tamanhoBytes: Buffer.byteLength(json),
    enviadoSupabase,
    supabaseErro,
    checksumSha256: conteudo.checksumSha256,
    resumo: conteudo.resumo,
  }
}

async function listarBackupsSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return []
  }

  try {
    await garantirBucketBackup()

    const { data, error } = await supabase.storage
      .from(BUCKET_BACKUP)
      .list("", {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      })

    if (error) throw error

    return (data || []).map((item) => ({
      arquivo: item.name,
      origem: "Supabase",
      tamanhoBytes: item.metadata?.size || null,
      criadoEm: item.created_at || item.updated_at || null,
    }))
  } catch (error) {
    console.error("ERRO AO LISTAR BACKUPS DO SUPABASE:", error)
    return []
  }
}

function listarBackupsLocais() {
  return fs
    .readdirSync(pastaBackups())
    .filter((arquivo) => arquivo.endsWith(".json") || arquivo.endsWith(".sql"))
    .map((arquivo) => {
      const caminho = path.join(pastaBackups(), arquivo)
      const stat = fs.statSync(caminho)

      return {
        arquivo,
        origem: "Local",
        tamanhoBytes: stat.size,
        criadoEm: stat.mtime,
      }
    })
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
}

async function lerBackup(arquivoRecebido) {
  const arquivo = path.basename(arquivoRecebido)

  if (!arquivo.endsWith(".json")) {
    const erro = new Error("Somente backups JSON v3.53+ podem ser restaurados automaticamente")
    erro.status = 400
    throw erro
  }

  const caminho = path.join(pastaBackups(), arquivo)
  let texto = null

  if (fs.existsSync(caminho)) {
    texto = fs.readFileSync(caminho, "utf-8")
  } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await supabase.storage
      .from(BUCKET_BACKUP)
      .download(arquivo)

    if (error || !data) {
      const erroLeitura = new Error("Backup não encontrado")
      erroLeitura.status = 404
      throw erroLeitura
    }

    const arrayBuffer = await data.arrayBuffer()
    texto = Buffer.from(arrayBuffer).toString("utf-8")
  }

  if (texto == null) {
    const erro = new Error("Backup não encontrado")
    erro.status = 404
    throw erro
  }

  try {
    return {
      arquivo,
      conteudo: JSON.parse(texto),
    }
  } catch (error) {
    const erroJson = new Error("O arquivo de backup está corrompido ou não contém JSON válido")
    erroJson.status = 400
    throw erroJson
  }
}

async function verificarDadosRestaurados({ conteudo, escritorioId, transaction }) {
  const mapa = modelosPorNome()
  const divergencias = []

  for (const [nome, registrosEsperados] of Object.entries(conteudo.dados)) {
    const Model = mapa.get(nome)
    if (!Model) {
      divergencias.push(`${nome}: modelo ausente`)
      continue
    }

    const registrosAtuais = await Model.findAll({
      where: { escritorioId },
      raw: true,
      order: orderPorPk(Model),
      transaction,
      semIsolamentoEscritorio: true,
    })

    const esperado = conteudo.checksumsTabelas?.[nome]
    const atual = checksumTabela(registrosAtuais)

    if (esperado !== atual || registrosEsperados.length !== registrosAtuais.length) {
      divergencias.push(nome)
    }
  }

  if (divergencias.length) {
    throw new Error(`Validação pós-restauração falhou nas tabelas: ${divergencias.join(", ")}`)
  }
}

async function restaurarConteudo({ conteudo, escritorioId }) {
  const mapa = modelosPorNome()

  await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
  }, async (transaction) => {
    await sequelize.query("SELECT pg_advisory_xact_lock(953000, :escritorioId)", {
      replacements: { escritorioId: Number(escritorioId) },
      transaction,
    })

    for (const nome of nomesModelosBackup()) {
      const Model = mapa.get(nome)
      await Model.destroy({
        where: { escritorioId },
        force: true,
        hooks: false,
        individualHooks: false,
        transaction,
        semIsolamentoEscritorio: true,
      })
    }

    for (const [nome, registros] of Object.entries(conteudo.dados)) {
      if (!registros.length) continue

      const Model = mapa.get(nome)
      await Model.bulkCreate(registros, {
        validate: true,
        hooks: false,
        individualHooks: false,
        returning: false,
        transaction,
        semIsolamentoEscritorio: true,
      })
    }

    await verificarDadosRestaurados({
      conteudo,
      escritorioId,
      transaction,
    })
  })
}

router.use(autenticar)
router.use(somenteAdmin)

router.post("/gerar", async (req, res) => {
  try {
    const resultado = await salvarBackup({ origem: "manual", req })
    res.json(resultado)
  } catch (error) {
    console.error("ERRO AO GERAR BACKUP:", error)

    await registrarAuditoria({
      req,
      acao: "GERAR_BACKUP",
      origem: "manual",
      status: "ERRO",
      detalhes: { erro: error.message },
    })

    res.status(500).json({
      message: "Erro ao gerar backup",
      detalhe: error.message,
    })
  }
})

router.get("/", async (req, res) => {
  const locais = listarBackupsLocais()
  const remotos = await listarBackupsSupabase()

  const porArquivo = new Map()

  for (const item of [...locais, ...remotos]) {
    const atual = porArquivo.get(item.arquivo)

    if (!atual || item.origem === "Supabase") {
      porArquivo.set(item.arquivo, item)
    }
  }

  res.json(Array.from(porArquivo.values()).sort(
    (a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0)
  ))
})

router.get("/validar/:arquivo", async (req, res) => {
  try {
    const { arquivo, conteudo } = await lerBackup(req.params.arquivo)
    const validacao = validarBackup(conteudo, {
      escritorioId: req.usuario.escritorioId,
      modelosDisponiveis: nomesModelosBackup(),
    })

    res.status(validacao.restauravel ? 200 : 422).json({
      arquivo,
      ...validacao,
    })
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Não foi possível validar o backup",
      detalhe: error.message,
      restauravel: false,
    })
  }
})

router.post("/restaurar/:arquivo", async (req, res) => {
  const arquivoSolicitado = path.basename(req.params.arquivo)
  let backupSeguranca = null

  try {
    if (String(req.body?.confirmacao || "").trim().toUpperCase() !== FRASE_CONFIRMACAO) {
      return res.status(400).json({
        message: `Confirmação inválida. Digite ${FRASE_CONFIRMACAO} para continuar.`,
      })
    }

    const { arquivo, conteudo } = await lerBackup(arquivoSolicitado)
    const validacao = validarBackup(conteudo, {
      escritorioId: req.usuario.escritorioId,
      modelosDisponiveis: nomesModelosBackup(),
    })

    if (!validacao.restauravel) {
      return res.status(422).json({
        message: "Este backup não pode ser restaurado com segurança",
        erros: validacao.erros,
        avisos: validacao.avisos,
      })
    }

    if (!req.body?.checksum || req.body.checksum !== conteudo.checksumSha256) {
      return res.status(409).json({
        message: "O backup mudou desde a validação. Valide novamente antes de restaurar.",
      })
    }

    const seguranca = await salvarBackup({
      origem: `pre-restauracao:${arquivo}`,
      req,
      prefixo: "backup-nexa-seguranca",
      auditar: false,
    })
    backupSeguranca = seguranca.arquivo

    if (!seguranca.enviadoSupabase) {
      const erroSeguranca = new Error(
        "Restauração bloqueada: não foi possível preservar o backup de segurança no Supabase"
      )
      erroSeguranca.status = 503
      throw erroSeguranca
    }

    await restaurarConteudo({
      conteudo,
      escritorioId: req.usuario.escritorioId,
    })

    await registrarAuditoria({
      req,
      acao: "RESTAURAR_BACKUP",
      arquivo,
      origem: conteudo.origem || "backup",
      status: "SUCESSO",
      checksum: conteudo.checksumSha256,
      backupSeguranca,
      detalhes: {
        geradoEm: conteudo.geradoEm,
        versaoAplicacao: conteudo.versaoAplicacao,
        totalTabelas: validacao.totalTabelas,
        totalRegistros: validacao.totalRegistros,
      },
    })

    res.json({
      message: "Backup restaurado e validado com sucesso",
      arquivo,
      backupSeguranca,
      validacao: {
        totalTabelas: validacao.totalTabelas,
        totalRegistros: validacao.totalRegistros,
        checksumSha256: conteudo.checksumSha256,
      },
    })
  } catch (error) {
    console.error("ERRO AO RESTAURAR BACKUP:", error)

    await registrarAuditoria({
      req,
      acao: "RESTAURAR_BACKUP",
      arquivo: arquivoSolicitado,
      status: "ERRO",
      backupSeguranca,
      detalhes: { erro: error.message },
    })

    res.status(error.status || 500).json({
      message: "Erro ao restaurar backup",
      detalhe: error.message,
      backupSeguranca,
    })
  }
})

router.get("/auditoria/restauracoes", async (req, res) => {
  try {
    const registros = await AuditoriaBackup.findAll({
      where: {
        escritorioId: req.usuario.escritorioId,
        acao: "RESTAURAR_BACKUP",
      },
      order: [["createdAt", "DESC"]],
      limit: 30,
      semIsolamentoEscritorio: true,
    })

    res.json(registros)
  } catch (error) {
    res.status(500).json({
      message: "Erro ao carregar auditoria de restaurações",
      detalhe: error.message,
    })
  }
})

router.get("/download/:arquivo", async (req, res) => {
  try {
    const arquivo = path.basename(req.params.arquivo)

    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data, error } = await supabase.storage
        .from(BUCKET_BACKUP)
        .createSignedUrl(arquivo, 60 * 10)

      if (!error && data?.signedUrl) {
        return res.json({ url: data.signedUrl })
      }
    }

    const caminho = path.join(pastaBackups(), arquivo)

    if (!fs.existsSync(caminho)) {
      return res.status(404).json({ message: "Backup não encontrado" })
    }

    return res.download(caminho)
  } catch (error) {
    console.error("ERRO AO BAIXAR BACKUP:", error)

    res.status(500).json({
      message: "Erro ao baixar backup",
      detalhe: error.message,
    })
  }
})

module.exports = router

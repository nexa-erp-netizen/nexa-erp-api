const express = require("express")
const fs = require("fs")
const path = require("path")
const { autenticar } = require("../middlewares/authMiddleware")
const supabase = require("../config/supabase")

const Cliente = require("../models/Cliente")
const Usuario = require("../models/Usuario")
const Empresa = require("../models/Empresa")
const Fiscal = require("../models/Fiscal")
const MovimentoCliente = require("../models/MovimentoCliente")
const LancamentoContabil = require("../models/LancamentoContabil")
const PlanoConta = require("../models/PlanoConta")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const Notificacao = require("../models/Notificacao")
const Servico = require("../models/Servico")
const FormaPagamento = require("../models/FormaPagamento")
const Declaracao = require("../models/Declaracao")
const Agenda = require("../models/Agenda")
const ContaReceber = require("../models/ContaReceber")
const FluxoCaixa = require("../models/FluxoCaixa")
const SolicitacaoCliente = require("../models/SolicitacaoCliente")

const router = express.Router()
const BUCKET_BACKUP = process.env.SUPABASE_BACKUP_BUCKET || "backup-sistema"

const tabelasBackup = [
  ["clientes", Cliente],
  ["usuarios", Usuario],
  ["empresas", Empresa],
  ["fiscal", Fiscal],
  ["movimentosCliente", MovimentoCliente],
  ["lancamentosContabeis", LancamentoContabil],
  ["planoContas", PlanoConta],
  ["financeiro", Financeiro],
  ["documentosDigitais", DocumentoDigital],
  ["notificacoes", Notificacao],
  ["servicos", Servico],
  ["formasPagamento", FormaPagamento],
  ["declaracoes", Declaracao],
  ["agenda", Agenda],
  ["contasReceber", ContaReceber],
  ["fluxoCaixa", FluxoCaixa],
  ["solicitacoesCliente", SolicitacaoCliente],
]

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

function nomeBackup() {
  const data = new Date().toISOString().replace(/[:.]/g, "-")
  return `backup-nexa-${data}.json`
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

async function montarBackup(origem = "manual") {
  const dados = {}
  const resumo = {}

  for (const [nome, Model] of tabelasBackup) {
    try {
      const registros = await Model.findAll({ raw: true })
      dados[nome] = registros
      resumo[nome] = registros.length
    } catch (error) {
      dados[nome] = []
      resumo[nome] = 0
      resumo[`${nome}_erro`] = error.message
    }
  }

  return {
    sistema: "Nexa ERP",
    tipo: "backup-json",
    origem,
    geradoEm: new Date().toISOString(),
    resumo,
    dados,
  }
}

async function salvarBackup({ origem = "manual" } = {}) {
  const arquivo = nomeBackup()
  const conteudo = await montarBackup(origem)
  const json = JSON.stringify(conteudo, null, 2)
  const caminho = path.join(pastaBackups(), arquivo)

  fs.writeFileSync(caminho, json, "utf-8")

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

  return {
    message: enviadoSupabase
      ? "Backup gerado e enviado para o Supabase com sucesso"
      : "Backup gerado localmente. Verifique as variáveis do Supabase para envio externo.",
    arquivo,
    formato: "json",
    tamanhoBytes: Buffer.byteLength(json),
    enviadoSupabase,
    supabaseErro,
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

router.use(autenticar)
router.use(somenteAdmin)

router.post("/gerar", async (req, res) => {
  try {
    const resultado = await salvarBackup({ origem: "manual" })
    res.json(resultado)
  } catch (error) {
    console.error("ERRO AO GERAR BACKUP:", error)

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

  res.json(Array.from(porArquivo.values()))
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

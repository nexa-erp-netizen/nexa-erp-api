const crypto = require("crypto")
const express = require("express")
const upload = require("../middlewares/upload")
const supabase = require("../config/supabase")
const Cliente = require("../models/Cliente")
const DasMei = require("../models/DasMei")
const Fiscal = require("../models/Fiscal")
const MovimentoCliente = require("../models/MovimentoCliente")
const LancamentoContabil = require("../models/LancamentoContabil")
const { autenticar } = require("../middlewares/authMiddleware")
const { lerDasMei } = require("../services/dasMeiParserService")

const router = express.Router()
const BUCKET = "nexa-anexos"

function dataEnvioDia15(vencimento) {
  const data = String(vencimento || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  return `${data.slice(0, 8)}15`
}

function competenciaFiscal(competencia) {
  const [ano, mes] = String(competencia || "").split("-")
  return ano && mes ? `${mes}/${ano}` : String(competencia || "")
}

function alertaFiscal(vencimento, pago) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const data = new Date(`${String(vencimento).slice(0, 10)}T00:00:00`)
  const diasParaVencer = Math.ceil((data.getTime() - hoje.getTime()) / 86400000)
  return {
    diasParaVencer,
    alertaFiscal: pago ? "Regularizado" : diasParaVencer < 0 ? "Vencido" : diasParaVencer === 0 ? "Vence hoje" : diasParaVencer <= 3 ? "Vencendo" : "Em dia",
  }
}

async function sincronizarPendenciaFiscal(guia) {
  if (!guia.publicadoNoPortal || guia.rotinaAtiva === false) return null
  const cliente = await Cliente.findByPk(guia.clienteId)
  if (!cliente) return null
  const pago = guia.status === "Paga"
  const observacao = `DAS-MEI:${guia.id}`
  const alerta = alertaFiscal(guia.vencimento, pago)
  const dados = {
    cliente: cliente.nome,
    obrigacao: "DAS-MEI",
    competencia: competenciaFiscal(guia.competencia),
    vencimento: guia.vencimento,
    status: pago ? "Pago" : "Pendente",
    valor: String(guia.valor || ""),
    observacao,
    anexos: [{ nome: guia.nomeArquivo, caminho: guia.caminhoArquivo, dasMeiId: guia.id }],
    diasParaVencer: alerta.diasParaVencer,
    alertaFiscal: alerta.alertaFiscal,
    empresaId: guia.empresaId || cliente.empresaId || null,
  }
  const existente = await Fiscal.findOne({ where: { observacao } })
  if (existente) {
    await existente.update(dados)
    return existente
  }
  return Fiscal.create(dados)
}

async function criarMovimentoPagamentoDas(guia, cliente) {
  const observacao = `das-mei:${guia.id}`
  const existente = await MovimentoCliente.findOne({
    where: { clienteId: cliente.id, tipo: "Despesa", observacao },
  })
  if (existente) return existente

  const valor = Number(String(guia.valor || "0").replace(",", "."))
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error("Não foi possível registrar a movimentação: DAS sem valor válido.")
  }

  return MovimentoCliente.create({
    clienteId: cliente.id,
    cliente: cliente.nome,
    tipo: "Despesa",
    data: new Date().toISOString().slice(0, 10),
    planoContaId: null,
    planoContaNome: "Impostos e taxas",
    forma: "Confirmado pelo cliente",
    descricao: `Pagamento confirmado - DAS-MEI ${competenciaFiscal(guia.competencia)}`,
    valor,
    formaPagamento: "Confirmado pelo cliente",
    comprovante: null,
    observacao,
    status: "Pendente",
  })
}

async function criarLancamentoDoMovimentoDas(movimento, guia, cliente) {
  const observacao = `movimento-cliente:${movimento.id}`
  const existente = await LancamentoContabil.findOne({
    where: { movimentoClienteId: movimento.id },
  })
  const dados = {
    clienteId: cliente.id,
    data: movimento.data,
    competencia: String(movimento.data).slice(0, 7).split("-").reverse().join("/"),
    tipo: movimento.tipo,
    planoConta: movimento.planoContaNome || "Impostos e taxas",
    descricao: movimento.descricao,
    quantidade: 1,
    valorUnitario: String(movimento.valor),
    valor: String(movimento.valor),
    formaPagamento: movimento.formaPagamento || movimento.forma || "",
    origem: "Cliente",
    movimentoClienteId: movimento.id,
    anexos: movimento.comprovante ? [{ nome: "Comprovante", caminho: movimento.comprovante }] : [],
    empresaId: guia.empresaId || cliente.empresaId || null,
  }
  if (existente) {
    await existente.update(dados)
    return existente
  }
  return LancamentoContabil.create({ clienteId: cliente.id, cliente: cliente.nome, ...dados, observacao })
}

function respostaGuia(guia, hoje) {
  const item = guia.toJSON ? guia.toJSON() : guia
  const dataProgramadaEnvio = item.dataProgramadaEnvio || dataEnvioDia15(item.vencimento)
  return {
    ...item,
    competencia: item.competencia,
    vencimento: item.vencimento,
    valor: item.valor,
    dataProgramadaEnvio,
    statusCalculado: item.status === "Programada" && dataProgramadaEnvio <= hoje
      ? "Pronta para envio"
      : item.status,
  }
}

function somenteEscritorio(req, res, next) {
  if (req.usuario.perfil === "Cliente") return res.status(403).json({ message: "Acesso não autorizado" })
  next()
}

function nomeSeguro(nome) {
  return String(nome || "das.pdf").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
}

function normalizarNomeCliente(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

async function acessoPermitido(req, clienteId) {
  if (req.usuario.perfil !== "Cliente") return true
  const cliente = await Cliente.findByPk(clienteId)
  const identificacaoCliente =
    req.usuario.clienteVinculado || req.usuario.nome || ""
  return Boolean(
    cliente &&
    normalizarNomeCliente(cliente.nome) ===
      normalizarNomeCliente(identificacaoCliente)
  )
}

router.get("/", autenticar, async (req, res) => {
  try {
    const clienteId = Number(req.query.clienteId)
    if (!clienteId || !(await acessoPermitido(req, clienteId))) return res.status(403).json({ message: "Acesso não autorizado" })
    const guias = await DasMei.findAll({ where: { clienteId, rotinaAtiva: true }, order: [["competencia", "ASC"]] })
    const hoje = new Date().toISOString().slice(0, 10)
    await Promise.all(guias.filter((guia) => !guia.dataProgramadaEnvio).map((guia) =>
      guia.update({ dataProgramadaEnvio: dataEnvioDia15(guia.vencimento) })
    ))
    res.json(guias.map((guia) => respostaGuia(guia, hoje)))
  } catch (error) {
    console.error("ERRO AO LISTAR DAS-MEI:", error)
    res.status(500).json({ message: "Erro ao listar guias DAS-MEI" })
  }
})

router.post("/importar/:clienteId", autenticar, somenteEscritorio, upload.array("arquivos", 12), async (req, res) => {
  const clienteId = Number(req.params.clienteId)
  const substituir = String(req.body.substituir || "false") === "true"
  const cliente = await Cliente.findByPk(clienteId)
  if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })
  const cnpjCliente = String(cliente.cnpj || "").replace(/\D/g, "")
  if (!cnpjCliente) return res.status(400).json({ message: "Cadastre o CNPJ do cliente antes da importação." })

  const resultados = []
  for (const file of req.files || []) {
    try {
      if (file.mimetype !== "application/pdf" && !file.originalname.toLowerCase().endsWith(".pdf")) throw new Error("Somente arquivos PDF são aceitos.")
      const dados = await lerDasMei(file.buffer)
      const dataProgramadaEnvio = dataEnvioDia15(dados.vencimento)
      if (dados.cnpj !== cnpjCliente) throw new Error("O CNPJ da guia não corresponde ao cliente selecionado.")
      const inicioRegimeAtual = String(cliente.dataOpcaoRegime || "").slice(0, 7)
      if (String(cliente.regime || "").toLowerCase() !== "mei" && inicioRegimeAtual && dados.competencia >= inicioRegimeAtual) {
        throw new Error(`A rotina de DAS-MEI está encerrada para este cliente desde ${inicioRegimeAtual.split("-").reverse().join("/")}.`)
      }
      const existente = await DasMei.findOne({ where: { clienteId, competencia: dados.competencia } })
      const hashArquivo = crypto.createHash("sha256").update(file.buffer).digest("hex")
      if (existente && existente.hashArquivo === hashArquivo) throw new Error("Esta competência já foi importada com o mesmo arquivo.")
      if (existente && !substituir) throw new Error("Já existe uma guia nesta competência. Marque a substituição para importar uma guia recalculada.")

      const caminho = `das-mei/${clienteId}/${dados.competencia}/${Date.now()}-${nomeSeguro(file.originalname)}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(caminho, file.buffer, { contentType: "application/pdf", upsert: false })
      if (uploadError) throw new Error("Não foi possível armazenar o PDF.")

      if (existente) {
        const historico = [...(existente.historico || []), { em: new Date().toISOString(), acao: "Guia substituída", arquivoAnterior: existente.nomeArquivo }]
        await existente.update({ ...dados, dataProgramadaEnvio, caminhoArquivo: caminho, nomeArquivo: file.originalname, hashArquivo, status: "Programada", enviadoEm: null, historico })
      } else {
        await DasMei.create({ ...dados, dataProgramadaEnvio, clienteId, empresaId: cliente.empresaId, caminhoArquivo: caminho, nomeArquivo: file.originalname, hashArquivo })
      }
      resultados.push({ arquivo: file.originalname, status: "importado", competencia: dados.competencia })
    } catch (error) {
      resultados.push({ arquivo: file.originalname, status: "bloqueado", motivo: error.message })
    }
  }
  res.status(resultados.some((item) => item.status === "importado") ? 201 : 400).json({ resultados })
})

router.put("/:id", autenticar, somenteEscritorio, async (req, res) => {
  const guia = await DasMei.findByPk(req.params.id)
  if (!guia) return res.status(404).json({ message: "Guia não encontrada" })
  const permitidos = ["competencia", "vencimento", "valor", "status"]
  const alteracoes = Object.fromEntries(permitidos.filter((campo) => campo in req.body).map((campo) => [campo, req.body[campo] || null]))
  if (alteracoes.vencimento) alteracoes.dataProgramadaEnvio = dataEnvioDia15(alteracoes.vencimento)
  alteracoes.historico = [...(guia.historico || []), {
    em: new Date().toISOString(),
    acao: "Guia editada",
    anterior: { competencia: guia.competencia, vencimento: guia.vencimento, valor: guia.valor },
    atualizado: {
      competencia: alteracoes.competencia ?? guia.competencia,
      vencimento: alteracoes.vencimento ?? guia.vencimento,
      valor: alteracoes.valor ?? guia.valor,
    },
  }]
  await guia.update(alteracoes)
  await sincronizarPendenciaFiscal(guia)
  res.json(guia)
})

router.post("/publicar-portal", autenticar, somenteEscritorio, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(Number).filter(Boolean))] : []
  if (!ids.length) return res.status(400).json({ message: "Selecione ao menos uma competência." })

  const guias = await DasMei.findAll({ where: { id: ids, rotinaAtiva: true } })
  if (guias.length !== ids.length) return res.status(404).json({ message: "Uma ou mais guias não foram encontradas." })

  const agora = new Date()
  await Promise.all(guias.map((guia) => guia.update({
    publicadoNoPortal: true,
    publicadoEm: agora,
    status: guia.status === "Paga" ? "Paga" : "Enviada",
    historico: [...(guia.historico || []), { em: agora.toISOString(), acao: "Guia publicada nas Pendências do Portal do Cliente" }],
  })))

  await Promise.all(guias.map((guia) => sincronizarPendenciaFiscal(guia)))

  res.json({ publicados: guias.length })
})

router.post("/:id/registrar-envio", autenticar, somenteEscritorio, async (req, res) => {
  const guia = await DasMei.findByPk(req.params.id)
  if (!guia) return res.status(404).json({ message: "Guia não encontrada" })
  await guia.update({ status: "Enviada", enviadoEm: new Date(), historico: [...(guia.historico || []), { em: new Date().toISOString(), acao: "Envio pelo WhatsApp registrado" }] })
  res.json(guia)
})

router.patch("/:id/marcar-pago-cliente", autenticar, async (req, res) => {
  if (req.usuario.perfil !== "Cliente") return res.status(403).json({ message: "Acesso não autorizado" })
  const guia = await DasMei.findByPk(req.params.id)
  if (!guia || !(await acessoPermitido(req, guia.clienteId))) return res.status(404).json({ message: "Guia não encontrada" })
  const cliente = await Cliente.findByPk(guia.clienteId)
  if (!cliente) return res.status(404).json({ message: "Cliente da guia não encontrado" })
  await guia.update({
    status: "Paga",
    historico: [...(guia.historico || []), { em: new Date().toISOString(), acao: "Pagamento informado pelo cliente" }],
  })
  await sincronizarPendenciaFiscal(guia)
  const movimento = await criarMovimentoPagamentoDas(guia, cliente)
  const lancamento = await criarLancamentoDoMovimentoDas(movimento, guia, cliente)
  res.json({ message: "Pagamento confirmado, movimentação e lançamento contábil criados", guia, movimento, lancamento })
})

router.get("/:id/arquivo", autenticar, async (req, res) => {
  const guia = await DasMei.findByPk(req.params.id)
  if (!guia || !(await acessoPermitido(req, guia.clienteId))) return res.status(404).json({ message: "Guia não encontrada" })
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(guia.caminhoArquivo, 60 * 15)
  if (error) return res.status(500).json({ message: "Erro ao abrir guia" })
  res.json({ url: data.signedUrl })
})

module.exports = router

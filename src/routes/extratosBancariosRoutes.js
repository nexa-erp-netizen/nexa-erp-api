const express = require("express")
const multer = require("multer")
const crypto = require("crypto")
const { Op } = require("sequelize")
const ContaBancariaCliente = require("../models/ContaBancariaCliente")
const ImportacaoExtratoBancario = require("../models/ImportacaoExtratoBancario")
const MovimentoBancario = require("../models/MovimentoBancario")
const MovimentoCliente = require("../models/MovimentoCliente")
const PlanoConta = require("../models/PlanoConta")
const LancamentoContabil = require("../models/LancamentoContabil")
const FechamentoConciliacaoBancaria = require("../models/FechamentoConciliacaoBancaria")
const sequelize = require("../config/database")
const { lerExtrato } = require("../services/extratoBancarioParser")
const { calcularSaldoAnterior, diagnosticarSaldoAnterior } = require("../services/saldoConciliacaoService")
const PDFDocument = require("pdfkit")

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private")
  res.set("Pragma", "no-cache")
  res.set("Expires", "0")
  next()
})

router.use((req, res, next) =>
  req.usuario.perfil === "Cliente"
    ? res.status(403).json({ message: "Acesso restrito ao escritório" })
    : next()
)

router.post("/importar", upload.single("arquivo"), async (req, res) => {
  let importacao = null
  try {
    if (!req.file) return res.status(400).json({ message: "Selecione um arquivo OFX ou CSV." })
    const conta = await ContaBancariaCliente.findByPk(Number(req.body.contaBancariaId))
    if (!conta || !conta.ativo) return res.status(400).json({ message: "Selecione uma conta bancária ativa." })
    const extensao = String(req.file.originalname || "").split(".").pop().toUpperCase()
    if (!["OFX", "CSV"].includes(extensao)) return res.status(400).json({ message: "Formato inválido. Envie um arquivo OFX ou CSV." })

    const hashArquivo = crypto.createHash("sha256").update(req.file.buffer).digest("hex")
    if (await ImportacaoExtratoBancario.findOne({ where: { contaBancariaId: conta.id, hashArquivo } })) {
      return res.status(409).json({ message: "Este mesmo extrato já foi importado para esta conta." })
    }

    const leitura = lerExtrato(req.file.buffer, extensao)
    if (!leitura.movimentos.length) return res.status(400).json({ message: "Nenhum movimento válido foi encontrado no extrato." })

    const competenciasDoArquivo = [...new Set(leitura.movimentos.map(item => String(item.data).slice(0, 7)))]
    const competenciaFechada = await FechamentoConciliacaoBancaria.findOne({
      where: { contaBancariaId: conta.id, competencia: { [Op.in]: competenciasDoArquivo }, status: "Fechado" },
    })
    if (competenciaFechada) return res.status(409).json({ message: `A competência ${competenciaBr(competenciaFechada.competencia)} está fechada. Reabra o mês antes de importar este extrato.` })

    const datas = leitura.movimentos.map(item => item.data).sort()
    importacao = await ImportacaoExtratoBancario.create({
      clienteId: conta.clienteId, cliente: conta.cliente, contaBancariaId: conta.id,
      nomeArquivo: req.file.originalname, formato: extensao, hashArquivo,
      totalLidos: leitura.movimentos.length, saldoInformado: leitura.saldoInformado,
      dataInicio: datas[0], dataFim: datas[datas.length - 1], status: "Processando",
    })

    const ocorrencias = new Map()
    const preparados = leitura.movimentos.map(item => {
      const base = item.fitId
        ? `fitid|${conta.id}|${item.fitId}`
        : `mov|${conta.id}|${item.data}|${Number(item.valorAssinado).toFixed(2)}|${normalizar(item.descricao)}|${item.documento || ""}`
      const numero = (ocorrencias.get(base) || 0) + 1
      ocorrencias.set(base, numero)
      const hashMovimento = crypto.createHash("sha256").update(`${base}|${item.fitId ? 1 : numero}`).digest("hex")
      return { ...item, hashMovimento }
    })

    const hashes = preparados.map(item => item.hashMovimento)
    const existentes = await MovimentoBancario.findAll({ where: { contaBancariaId: conta.id, hashMovimento: { [Op.in]: hashes } }, attributes: ["hashMovimento"] })
    const hashesExistentes = new Set(existentes.map(item => item.hashMovimento))
    const novos = preparados.filter(item => !hashesExistentes.has(item.hashMovimento))
    const registros = novos.map(item => ({
      clienteId: conta.clienteId, cliente: conta.cliente, contaBancariaId: conta.id, importacaoId: importacao.id,
      data: item.data, descricao: item.descricao.slice(0, 500), documento: item.documento,
      fitId: item.fitId, tipoBanco: item.tipoBanco,
      natureza: item.valorAssinado >= 0 ? "Entrada" : "Saída",
      valor: Math.abs(item.valorAssinado), valorAssinado: item.valorAssinado,
      hashMovimento: item.hashMovimento, statusConciliacao: "Pendente",
    }))
    if (registros.length) await MovimentoBancario.bulkCreate(registros)

    const totalEntradas = novos.filter(i => i.valorAssinado > 0).reduce((s, i) => s + i.valorAssinado, 0)
    const totalSaidas = novos.filter(i => i.valorAssinado < 0).reduce((s, i) => s + Math.abs(i.valorAssinado), 0)
    await importacao.update({
      totalImportados: novos.length,
      totalDuplicados: preparados.length - novos.length,
      totalEntradas,
      totalSaidas,
      status: "Importado",
    })

    res.status(201).json({
      importacao,
      resumo: { lidos: preparados.length, importados: novos.length, duplicados: preparados.length - novos.length, totalEntradas, totalSaidas, saldoInformado: leitura.saldoInformado },
    })
  } catch (error) {
    console.error(error)
    if (importacao) await importacao.update({ status: "Erro" }).catch(() => {})
    res.status(400).json({ message: error.message || "Erro ao importar extrato bancário" })
  }
})

router.get("/movimentos", async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.contaBancariaId) where.contaBancariaId = Number(req.query.contaBancariaId)
    if (req.query.status) where.statusConciliacao = req.query.status
    if (req.query.inicio || req.query.fim) {
      where.data = {}
      if (req.query.inicio) where.data[Op.gte] = req.query.inicio
      if (req.query.fim) where.data[Op.lte] = req.query.fim
    }
    const movimentos = await MovimentoBancario.findAll({ where, order: [["data", "DESC"], ["id", "DESC"]], limit: 2000 })
    res.json(movimentos)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao listar movimentos bancários" })
  }
})

router.get("/importacoes", async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.contaBancariaId) where.contaBancariaId = Number(req.query.contaBancariaId)
    res.json(await ImportacaoExtratoBancario.findAll({ where, order: [["createdAt", "DESC"]], limit: 100 }))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao listar importações" })
  }
})

router.get("/fechamentos", async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.contaBancariaId) where.contaBancariaId = Number(req.query.contaBancariaId)
    res.json(await FechamentoConciliacaoBancaria.findAll({ where, order: [["competencia", "DESC"]] }))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao listar fechamentos bancários" })
  }
})

router.get("/diagnostico-saldo", async (req, res) => {
  try {
    const contaBancariaId = Number(req.query.contaBancariaId)
    const competencia = String(req.query.competencia || "")
    if (!contaBancariaId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
      return res.status(400).json({ message: "Informe a conta bancária e a competência no formato AAAA-MM." })
    }
    const conta = await ContaBancariaCliente.findByPk(contaBancariaId)
    if (!conta) return res.status(404).json({ message: "Conta bancária não encontrada." })
    const periodo = periodoCompetencia(competencia)
    const movimentos = await MovimentoBancario.findAll({
      where: { contaBancariaId, data: { [Op.lt]: periodo.inicio } },
      order: [["data", "ASC"], ["id", "ASC"]],
    })
    const diagnostico = diagnosticarSaldoAnterior({
      saldoInicial: conta.saldoInicial,
      dataSaldoInicial: conta.dataSaldoInicial,
      inicioCompetencia: periodo.inicio,
      movimentos,
    })
    res.json({
      conta: { id: conta.id, clienteId: conta.clienteId, cliente: conta.cliente, banco: conta.bancoNome },
      competencia,
      ...diagnostico,
      movimentosConsiderados: diagnostico.movimentosConsiderados.map(resumoMovimento),
      movimentosAnterioresAoMarco: diagnostico.movimentosAnterioresAoMarco.map(resumoMovimento),
      alteracaoExecutada: false,
      recomendacao: diagnostico.inconsistente
        ? "Manter os movimentos para auditoria e excluí-los somente do cálculo por serem anteriores ao marco inicial da conta."
        : "Nenhuma correção de dados é necessária.",
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao diagnosticar o saldo anterior." })
  }
})

router.post("/fechamentos", async (req, res) => {
  try {
    const contaBancariaId = Number(req.body.contaBancariaId)
    const competencia = String(req.body.competencia || "")
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return res.status(400).json({ message: "Competência inválida." })
    const conta = await ContaBancariaCliente.findByPk(contaBancariaId)
    if (!conta) return res.status(404).json({ message: "Conta bancária não encontrada." })
    const existente = await FechamentoConciliacaoBancaria.findOne({ where: { contaBancariaId, competencia } })
    if (existente?.status === "Fechado") return res.status(409).json({ message: "Esta competência já está fechada." })

    const periodo = periodoCompetencia(competencia)
    const movimentos = await MovimentoBancario.findAll({ where: { contaBancariaId, data: { [Op.between]: [periodo.inicio, periodo.fim] } } })
    if (!movimentos.length) return res.status(400).json({ message: "Não existem movimentos nesta competência." })

    const movimentosClienteBrutos = await MovimentoCliente.findAll({
      where: {
        data: { [Op.between]: [periodo.inicio, periodo.fim] },
        status: { [Op.ne]: "Rejeitado" },
      },
      order: [["data", "ASC"], ["id", "ASC"]],
    })

    const movimentosCliente = movimentosClienteBrutos.filter(item =>
      normalizar(item.cliente) === normalizar(conta.cliente) &&
      movimentoClienteEhBancario(item)
    )

    const movimentosComparaveis = movimentos.filter(item =>
      item.statusConciliacao !== "Ignorado" &&
      !item.lancamentoContabilId
    )

    const diferencas = calcularDiferencasDiarias(movimentosComparaveis, movimentosCliente)
    const diasDiferentes = [...new Set(diferencas.map(item => item.data))]

    if (diasDiferentes.length) {
      return res.status(409).json({
        message: `Existem ${diasDiferentes.length} dia(s) com diferença entre o banco e os lançamentos do cliente.`,
        diasComDiferenca: diasDiferentes.length,
        diferencas,
      })
    }

    const naoConcluidos = movimentos.filter(m =>
      !["Conciliado", "Ignorado", "Lançado"].includes(m.statusConciliacao)
    )
    for (const movimento of naoConcluidos) {
      await movimento.update({
        statusConciliacao: "Conciliado",
        conciliadoEm: new Date(),
        conciliadoPor: req.usuario.nome || req.usuario.email || "Equipe Nexa",
        observacoes: movimento.observacoes || "Nexa Auto • fechamento confirmado pelos totais diários",
      })
    }

    const anteriores = await MovimentoBancario.findAll({ where: { contaBancariaId, data: { [Op.lt]: periodo.inicio } } })
    const calculoSaldo = calcularSaldoAnterior({
      saldoInicial: conta.saldoInicial,
      dataSaldoInicial: conta.dataSaldoInicial,
      inicioCompetencia: periodo.inicio,
      movimentos: anteriores,
    })
    const saldoInicial = calculoSaldo.saldoAnterior
    const totalEntradas = movimentos.filter(m => m.natureza === "Entrada").reduce((total, m) => total + Number(m.valor || 0), 0)
    const totalSaidas = movimentos.filter(m => m.natureza === "Saída").reduce((total, m) => total + Number(m.valor || 0), 0)
    const dados = {
      clienteId: conta.clienteId, cliente: conta.cliente, contaBancariaId, competencia,
      saldoInicial, totalEntradas, totalSaidas, saldoFinal: saldoInicial + totalEntradas - totalSaidas,
      quantidadeMovimentos: movimentos.length, status: "Fechado", fechadoEm: new Date(),
      fechadoPor: req.usuario.nome || req.usuario.email || "Equipe Nexa", reabertoEm: null, reabertoPor: null,
    }
    if (existente) { await existente.update(dados); return res.json(existente) }
    res.status(201).json(await FechamentoConciliacaoBancaria.create(dados))
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao fechar competência bancária" })
  }
})

router.patch("/fechamentos/:id/reabrir", async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") return res.status(403).json({ message: "Somente o administrador pode reabrir uma competência." })
    const fechamento = await FechamentoConciliacaoBancaria.findByPk(req.params.id)
    if (!fechamento) return res.status(404).json({ message: "Fechamento não encontrado." })
    await fechamento.update({ status: "Reaberto", reabertoEm: new Date(), reabertoPor: req.usuario.nome || req.usuario.email || "Administrador" })
    res.json(fechamento)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao reabrir competência" })
  }
})

router.get("/fechamentos/:id/pdf", async (req, res) => {
  try {
    const fechamento = await FechamentoConciliacaoBancaria.findByPk(req.params.id)
    if (!fechamento) return res.status(404).json({ message: "Fechamento não encontrado." })
    const conta = await ContaBancariaCliente.findByPk(fechamento.contaBancariaId)
    const doc = new PDFDocument({ size: "A4", margin: 45 })
    const partes = []
    doc.on("data", parte => partes.push(parte))
    doc.on("end", () => {
      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", `attachment; filename=conciliacao-${fechamento.competencia}.pdf`)
      res.send(Buffer.concat(partes))
    })
    doc.fillColor("#0b4a84").font("Helvetica-Bold").fontSize(19).text("RELATÓRIO DE CONCILIAÇÃO BANCÁRIA", { align: "center" })
    doc.moveDown().fillColor("#172b4d").fontSize(11).text(fechamento.cliente, { align: "center" })
    doc.font("Helvetica").fontSize(9).text(`Competência: ${competenciaBr(fechamento.competencia)}  •  Conta: ${conta?.bancoNome || "-"} - Ag. ${conta?.agencia || "-"} - ${conta?.conta || "-"}${conta?.digito ? `-${conta.digito}` : ""}`, { align: "center" })
    doc.moveDown(2)
    const itens = [["Saldo inicial", fechamento.saldoInicial], ["Entradas", fechamento.totalEntradas], ["Saídas", fechamento.totalSaidas], ["Saldo final", fechamento.saldoFinal]]
    itens.forEach(([titulo, valor], indice) => {
      const y = doc.y
      doc.rect(55, y, 485, 34).fillAndStroke(indice === 3 ? "#c8f3dc" : "#e8f2fb", "#76a4c9")
      doc.fillColor("#183653").font("Helvetica-Bold").fontSize(10).text(titulo, 68, y + 11)
      doc.text(moedaPdf(valor), 330, y + 11, { width: 195, align: "right" })
      doc.y = y + 42
    })
    doc.moveDown().fillColor("#354b63").font("Helvetica").fontSize(9).text(`${fechamento.quantidadeMovimentos} movimento(s) conferido(s).`)
    doc.text(`Fechado por ${fechamento.fechadoPor || "Equipe Nexa"} em ${new Date(fechamento.fechadoEm).toLocaleString("pt-BR")}.`)
    doc.moveDown(3).fontSize(8).fillColor("#6b7d90").text("Documento gerado pelo Nexa ERP.", { align: "center" })
    doc.end()
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao gerar relatório da conciliação" })
  }
})

router.patch("/movimentos/:id", async (req, res) => {
  try {
    const movimento = await MovimentoBancario.findByPk(req.params.id)
    if (!movimento) return res.status(404).json({ message: "Movimento bancário não encontrado" })
    if (movimento.lancamentoContabilId) return res.status(409).json({ message: "Este movimento já gerou um lançamento contábil." })
    const status = statusValido(req.body.statusConciliacao || "Classificado")
    const plano = req.body.planoContaId ? await PlanoConta.findByPk(Number(req.body.planoContaId)) : null
    if (status === "Classificado" && !plano) return res.status(400).json({ message: "Selecione uma conta do Plano de Contas." })
    await movimento.update({
      planoContaId: plano?.id || movimento.planoContaId || null,
      categoriaSugerida: plano?.conta || movimento.categoriaSugerida,
      statusConciliacao: status,
      conciliadoEm: status === "Conciliado" ? new Date() : null,
      conciliadoPor: status === "Conciliado" ? (req.usuario.nome || req.usuario.email || "Equipe Nexa") : null,
      observacoes: req.body.observacoes !== undefined ? String(req.body.observacoes || "").trim() || null : movimento.observacoes,
    })
    res.json(movimento)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao classificar movimento" })
  }
})

router.post("/movimentos/classificar-lote", async (req, res) => {
  try {
    const ids = [...new Set((req.body.ids || []).map(Number).filter(Number.isInteger))]
    if (!ids.length) return res.status(400).json({ message: "Selecione pelo menos um movimento." })
    const status = statusValido(req.body.statusConciliacao || "Classificado")
    const plano = req.body.planoContaId ? await PlanoConta.findByPk(Number(req.body.planoContaId)) : null
    if (status === "Classificado" && !plano) return res.status(400).json({ message: "Selecione uma conta do Plano de Contas." })
    const movimentos = await MovimentoBancario.findAll({ where: { id: { [Op.in]: ids }, lancamentoContabilId: null } })
    for (const movimento of movimentos) {
      await movimento.update({
        planoContaId: plano?.id || movimento.planoContaId || null,
        categoriaSugerida: plano?.conta || movimento.categoriaSugerida,
        statusConciliacao: status,
        conciliadoEm: status === "Conciliado" ? new Date() : null,
        conciliadoPor: status === "Conciliado" ? (req.usuario.nome || req.usuario.email || "Equipe Nexa") : null,
      })
    }
    res.json({ atualizados: movimentos.length })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao classificar movimentos em lote" })
  }
})


router.post("/movimentos/conciliar-automatico", async (req, res) => {
  const transaction = await sequelize.transaction()
  try {
    const contaBancariaId = Number(req.body.contaBancariaId)
    const competencia = String(req.body.competencia || "").trim()

    if (!contaBancariaId) throw new Error("Selecione uma conta bancária.")
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw new Error("Competência inválida.")

    const conta = await ContaBancariaCliente.findByPk(contaBancariaId, { transaction })
    if (!conta || !conta.ativo) throw new Error("Conta bancária não encontrada ou inativa.")

    const fechamento = await FechamentoConciliacaoBancaria.findOne({
      where: { contaBancariaId, competencia, status: "Fechado" },
      transaction,
    })
    if (fechamento) throw new Error("Esta competência está fechada. Reabra o mês antes de conciliar.")

    const { inicio, fim } = periodoCompetencia(competencia)

    const movimentosBanco = await MovimentoBancario.findAll({
      where: {
        contaBancariaId,
        data: { [Op.between]: [inicio, fim] },
        lancamentoContabilId: null,
        statusConciliacao: { [Op.ne]: "Ignorado" },
      },
      order: [["data", "ASC"], ["id", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    })

    const movimentosClienteBrutos = await MovimentoCliente.findAll({
      where: {
        data: { [Op.between]: [inicio, fim] },
        status: { [Op.ne]: "Rejeitado" },
      },
      order: [["data", "ASC"], ["id", "ASC"]],
      transaction,
    })

    const movimentosCliente = movimentosClienteBrutos.filter(item =>
      normalizar(item.cliente) === normalizar(conta.cliente) &&
      movimentoClienteEhBancario(item)
    )

    const usadosBanco = new Set()
    const usadosCliente = new Set()
    let exatos = 0
    let agrupados = 0
    let gruposAgrupados = 0
    let jaConciliados = 0
    const usuarioConciliacao = req.usuario.nome || req.usuario.email || "Equipe Nexa"

    async function conciliarBanco(banco, observacao, clientesReferencia = []) {
      usadosBanco.add(Number(banco.id))
      clientesReferencia.forEach(item => usadosCliente.add(Number(item.id)))

      if (banco.statusConciliacao === "Conciliado") {
        jaConciliados += 1
        return false
      }

      const planoReferencia = clientesReferencia.find(item => item.planoContaId)
      await banco.update({
        planoContaId: planoReferencia?.planoContaId || banco.planoContaId || null,
        categoriaSugerida: planoReferencia?.planoContaNome || banco.categoriaSugerida,
        statusConciliacao: "Conciliado",
        conciliadoEm: new Date(),
        conciliadoPor: usuarioConciliacao,
        observacoes: observacao,
      }, { transaction })
      return true
    }

    const chaveBanco = item =>
      `${item.natureza === "Entrada" ? "Receita" : "Despesa"}|${item.data}|${Number(item.valor || 0).toFixed(2)}`
    const chaveCliente = item =>
      `${item.tipo}|${item.data}|${Number(item.valor || 0).toFixed(2)}`

    const gruposBanco = agruparPor(movimentosBanco, chaveBanco)
    const gruposCliente = agruparPor(movimentosCliente, chaveCliente)

    // Nível 1 — mesma data, natureza e valor.
    for (const [chave, bancoGrupo] of gruposBanco.entries()) {
      const clienteGrupo = gruposCliente.get(chave) || []
      if (!clienteGrupo.length) continue
      if (clienteGrupo.length > bancoGrupo.length) continue

      const limite = Math.min(bancoGrupo.length, clienteGrupo.length)
      for (let i = 0; i < limite; i += 1) {
        const banco = bancoGrupo[i]
        const cliente = clienteGrupo[i]
        const alterou = await conciliarBanco(
          banco,
          `Nexa Auto • correspondência exata • Movimento Cliente #${cliente.id} • ${cliente.data} • ${cliente.tipo} • ${Number(cliente.valor || 0).toFixed(2)}`,
          [cliente]
        )
        if (alterou) exatos += 1
      }
    }

    // Restante por dia e natureza.
    const chavesDia = new Set()
    movimentosBanco.forEach(item => {
      if (!usadosBanco.has(Number(item.id))) {
        chavesDia.add(`${item.natureza === "Entrada" ? "Receita" : "Despesa"}|${item.data}`)
      }
    })
    movimentosCliente.forEach(item => {
      if (!usadosCliente.has(Number(item.id))) chavesDia.add(`${item.tipo}|${item.data}`)
    })

    for (const chave of [...chavesDia].sort()) {
      const [tipo, data] = chave.split("|")

      let bancoGrupo = movimentosBanco.filter(item =>
        !usadosBanco.has(Number(item.id)) &&
        (item.natureza === "Entrada" ? "Receita" : "Despesa") === tipo &&
        String(item.data) === data
      )
      let clienteGrupo = movimentosCliente.filter(item =>
        !usadosCliente.has(Number(item.id)) &&
        item.tipo === tipo &&
        String(item.data) === data
      )

      if (!bancoGrupo.length || !clienteGrupo.length) continue

      // Nível 2A — total do dia.
      let totalBanco = somarValores(bancoGrupo)
      let totalCliente = somarValores(clienteGrupo)
      if (valoresIguais(totalBanco, totalCliente)) {
        const idsCliente = clienteGrupo.map(item => item.id)
        for (const banco of bancoGrupo) {
          const alterou = await conciliarBanco(
            banco,
            `Nexa Auto • total diário • Movimentos Cliente #${idsCliente.join(",#")} • ${data} • ${tipo} • total ${totalCliente.toFixed(2)}`,
            clienteGrupo
          )
          if (alterou) agrupados += 1
        }
        gruposAgrupados += 1
        continue
      }

      // Nível 2B — 1 banco ↔ vários lançamentos do cliente.
      for (const banco of [...bancoGrupo].sort((x, y) => Number(y.valor) - Number(x.valor))) {
        if (usadosBanco.has(Number(banco.id))) continue
        const disponiveis = clienteGrupo.filter(item => !usadosCliente.has(Number(item.id)))
        const combinacao = encontrarCombinacao(disponiveis, Number(banco.valor || 0), 8)
        if (!combinacao?.length) continue

        const idsCliente = combinacao.map(item => item.id)
        const alterou = await conciliarBanco(
          banco,
          `Nexa Auto • 1 banco ↔ ${combinacao.length} lançamentos • Movimentos Cliente #${idsCliente.join(",#")} • ${data} • ${tipo}`,
          combinacao
        )
        if (alterou) agrupados += 1
        gruposAgrupados += 1
      }

      // Nível 2C — vários movimentos do banco ↔ 1 lançamento do cliente.
      bancoGrupo = bancoGrupo.filter(item => !usadosBanco.has(Number(item.id)))
      clienteGrupo = clienteGrupo.filter(item => !usadosCliente.has(Number(item.id)))

      for (const cliente of [...clienteGrupo].sort((x, y) => Number(y.valor) - Number(x.valor))) {
        if (usadosCliente.has(Number(cliente.id))) continue
        const disponiveis = bancoGrupo.filter(item => !usadosBanco.has(Number(item.id)))
        const combinacao = encontrarCombinacao(disponiveis, Number(cliente.valor || 0), 8)
        if (!combinacao?.length) continue

        usadosCliente.add(Number(cliente.id))
        for (const banco of combinacao) {
          const alterou = await conciliarBanco(
            banco,
            `Nexa Auto • ${combinacao.length} bancos ↔ 1 lançamento • Movimento Cliente #${cliente.id} • ${data} • ${tipo}`,
            [cliente]
          )
          if (alterou) agrupados += 1
        }
        gruposAgrupados += 1
      }

      // Nível 3 — residual do dia.
      bancoGrupo = movimentosBanco.filter(item =>
        !usadosBanco.has(Number(item.id)) &&
        (item.natureza === "Entrada" ? "Receita" : "Despesa") === tipo &&
        String(item.data) === data
      )
      clienteGrupo = movimentosCliente.filter(item =>
        !usadosCliente.has(Number(item.id)) &&
        item.tipo === tipo &&
        String(item.data) === data
      )

      if (bancoGrupo.length && clienteGrupo.length) {
        totalBanco = somarValores(bancoGrupo)
        totalCliente = somarValores(clienteGrupo)
        if (valoresIguais(totalBanco, totalCliente)) {
          const idsCliente = clienteGrupo.map(item => item.id)
          for (const banco of bancoGrupo) {
            const alterou = await conciliarBanco(
              banco,
              `Nexa Auto • residual diário • Movimentos Cliente #${idsCliente.join(",#")} • ${data} • ${tipo} • total ${totalCliente.toFixed(2)}`,
              clienteGrupo
            )
            if (alterou) agrupados += 1
          }
          gruposAgrupados += 1
        }
      }
    }

    const restantesBanco = movimentosBanco.filter(item => !usadosBanco.has(Number(item.id)))
    const restantesCliente = movimentosCliente.filter(item => !usadosCliente.has(Number(item.id)))
    const diferencas = calcularDiferencasDiarias(restantesBanco, restantesCliente)

    await transaction.commit()
    res.json({
      exatos,
      agrupados,
      gruposAgrupados,
      jaConciliados,
      conciliadosAgora: exatos + agrupados,
      pendentes: restantesBanco.length,
      diasComDiferenca: new Set(diferencas.map(item => item.data)).size,
      diferencas,
    })
  } catch (error) {
    await transaction.rollback()
    console.error(error)
    res.status(400).json({ message: error.message || "Erro na conciliação automática" })
  }
})

router.post("/movimentos/sugerir", async (req, res) => {
  try {
    const contaBancariaId = Number(req.body.contaBancariaId)
    const pendentes = await MovimentoBancario.findAll({ where: { contaBancariaId, statusConciliacao: "Pendente", planoContaId: null } })
    if (!pendentes.length) return res.json({ sugeridos: 0 })
    const historico = await MovimentoBancario.findAll({
      where: { clienteId: pendentes[0].clienteId, planoContaId: { [Op.ne]: null }, statusConciliacao: { [Op.in]: ["Classificado", "Conciliado", "Lançado"] } },
      order: [["updatedAt", "DESC"]],
    })
    let sugeridos = 0
    for (const movimento of pendentes) {
      const melhor = melhorHistorico(movimento, historico)
      if (!melhor) continue
      await movimento.update({ planoContaId: melhor.planoContaId, categoriaSugerida: melhor.categoriaSugerida, statusConciliacao: "Classificado" })
      sugeridos += 1
    }
    res.json({ sugeridos })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao sugerir classificações" })
  }
})

router.post("/gerar-lancamentos", async (_req, res) => {
  return res.status(403).json({
    message: "A geração automática de Receita/Despesa pela Conciliação Bancária está desativada. O extrato serve somente para conferir Movimentos Clientes.",
  })
})


function movimentoClienteEhBancario(item) {
  const plano = normalizar(item?.planoContaNome)
  if (plano) return plano.includes("banco")

  const forma = normalizar(`${item?.formaPagamento || ""} ${item?.forma || ""}`)
  return /pix|cartao|transferencia|ted|doc|debito|credito|banco/.test(forma)
}

function agruparPor(lista, chaveFn) {
  const mapa = new Map()
  for (const item of lista) {
    const chave = chaveFn(item)
    const grupo = mapa.get(chave) || []
    grupo.push(item)
    mapa.set(chave, grupo)
  }
  return mapa
}

function somarValores(lista) {
  return lista.reduce((total, item) => total + Number(item.valor || 0), 0)
}

function valoresIguais(a, b) {
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.01
}

function encontrarCombinacao(itens, alvoValor, maxItens = 8) {
  const alvo = Math.round(Number(alvoValor || 0) * 100)
  if (!Number.isFinite(alvo) || alvo <= 0 || itens.length < 2) return null

  const candidatos = itens
    .map(item => ({ item, centavos: Math.round(Number(item.valor || 0) * 100) }))
    .filter(x => x.centavos > 0 && x.centavos <= alvo)
    .sort((a, b) => b.centavos - a.centavos)

  if (candidatos.length < 2) return null

  const dp = new Map([[0, []]])
  const LIMITE_ESTADOS = 40000

  for (let indice = 0; indice < candidatos.length; indice += 1) {
    const candidato = candidatos[indice]
    const estados = [...dp.entries()]

    for (const [soma, indices] of estados) {
      if (indices.length >= maxItens) continue
      const novaSoma = soma + candidato.centavos
      if (novaSoma > alvo || dp.has(novaSoma)) continue

      const novaLista = [...indices, indice]
      if (novaSoma === alvo && novaLista.length >= 2) {
        return novaLista.map(i => candidatos[i].item)
      }

      dp.set(novaSoma, novaLista)
      if (dp.size > LIMITE_ESTADOS) break
    }

    if (dp.size > LIMITE_ESTADOS) break
  }

  return null
}

function calcularDiferencasDiarias(movimentosBanco, movimentosCliente) {
  const mapa = new Map()

  function obter(data, tipo) {
    const chave = `${data}|${tipo}`
    if (!mapa.has(chave)) {
      mapa.set(chave, { data: String(data), tipo, banco: 0, cliente: 0 })
    }
    return mapa.get(chave)
  }

  movimentosBanco.forEach(item => {
    const tipo = item.natureza === "Entrada" ? "Receita" : "Despesa"
    obter(item.data, tipo).banco += Number(item.valor || 0)
  })

  movimentosCliente.forEach(item => {
    if (!["Receita", "Despesa"].includes(item.tipo)) return
    obter(item.data, item.tipo).cliente += Number(item.valor || 0)
  })

  return [...mapa.values()]
    .map(item => ({ ...item, diferenca: Number((item.banco - item.cliente).toFixed(2)) }))
    .filter(item => Math.abs(item.diferenca) >= 0.01)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.tipo).localeCompare(String(b.tipo)))
}

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

function periodoCompetencia(competencia) {
  const [ano, mes] = competencia.split("-").map(Number)
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return { inicio: `${competencia}-01`, fim: `${competencia}-${String(ultimoDia).padStart(2, "0")}` }
}

function competenciaBr(valor) { const [ano, mes] = String(valor).split("-"); return `${mes}/${ano}` }
function resumoMovimento(item) {
  return { id: item.id, data: item.data, descricao: item.descricao, valorAssinado: Number(item.valorAssinado || 0), statusConciliacao: item.statusConciliacao }
}
function moedaPdf(valor) { return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }

function statusValido(status) {
  return ["Pendente", "Classificado", "Conciliado", "Ignorado"].includes(status) ? status : "Classificado"
}

function palavras(valor) {
  return new Set(normalizar(valor).split(/[^a-z0-9]+/).filter(p => p.length >= 3 && !["pagamento", "recebimento", "pix", "ted", "doc"].includes(p)))
}

function melhorHistorico(movimento, historico) {
  const atual = palavras(movimento.descricao)
  let melhor = null, melhorNota = 0
  for (const item of historico) {
    if (item.natureza !== movimento.natureza || !item.planoContaId) continue
    const anterior = palavras(item.descricao)
    const comuns = [...atual].filter(p => anterior.has(p)).length
    const nota = atual.size && anterior.size ? comuns / Math.max(atual.size, anterior.size) : 0
    if (normalizar(item.descricao) === normalizar(movimento.descricao)) { melhor = item; melhorNota = 1; break }
    if (nota > melhorNota) { melhor = item; melhorNota = nota }
  }
  return melhorNota >= 0.5 ? melhor : null
}

router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "O extrato deve ter no máximo 10 MB." })
  if (error) return res.status(400).json({ message: "Não foi possível receber o arquivo." })
  next()
})

module.exports = router

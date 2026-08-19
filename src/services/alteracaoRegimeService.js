const { Op } = require("sequelize")
const sequelize = require("../config/database")
const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const DasMei = require("../models/DasMei")
const HistoricoRegimeTributario = require("../models/HistoricoRegimeTributario")
const {
  extrairCompetencia,
  identificarEscopo,
  normalizar,
  respostaConfirmaExecucao,
  respostaCancelaExecucao,
} = require("./regimeParserService")

function competenciaFiscal(valor) {
  const texto = String(valor || "").trim()
  let achou = texto.match(/^(\d{4})-(\d{2})$/)
  if (achou) return `${achou[1]}-${achou[2]}`
  achou = texto.match(/^(\d{2})\/(\d{4})$/)
  return achou ? `${achou[2]}-${achou[1]}` : null
}

function encerrada(status) {
  return /(pago|concluid|entregue|quitad|cancelad|arquivad|finalizad)/.test(normalizar(status))
}

function respostaBase(dados) {
  return {
    ...dados,
    alteracaoSensivel: true,
    conversacionalV2: true,
  }
}

async function responderConfirmacaoAlteracaoRegime({ confirmacao, mensagem, usuario }) {
  if (!confirmacao || confirmacao.tipo !== "regime-tributario") return null

  if (respostaCancelaExecucao(mensagem)) {
    return respostaBase({
      resposta: `Certo. A alteração de regime de ${confirmacao.clienteNome} foi cancelada. Nenhum dado foi modificado.`,
      confirmacaoAlteracaoConcluida: true,
      alteracaoCancelada: true,
      consulta: { tipo: "alteracao-regime-cancelada", titulo: `Alteração cancelada — ${confirmacao.clienteNome}`, resumo: "Nenhuma alteração foi realizada.", total: 0, itens: [] },
    })
  }

  const dadosColetados = confirmacao.dadosColetados || null
  const escopo = dadosColetados?.escopo || identificarEscopo(mensagem)
  const periodo = dadosColetados?.periodo || extrairCompetencia(mensagem)

  if (dadosColetados && !respostaConfirmaExecucao(mensagem)) {
    return respostaBase({
      resposta: `A alteração ainda não foi executada. Responda “confirmar” para atualizar o cadastro de ${confirmacao.clienteNome} ou “cancelar” para encerrar sem modificar nada.`,
      confirmacaoAlteracaoPendente: confirmacao,
      consulta: { tipo: "confirmacao-final-alteracao-regime", titulo: `Confirmação final — ${confirmacao.clienteNome}`, resumo: "Aguardando confirmar ou cancelar.", total: 1, itens: [] },
    })
  }

  if (!escopo || !periodo) {
    const faltam = [!escopo ? "se é somente no cadastro da Nexa ou um processo real" : null, !periodo ? "a competência inicial" : null].filter(Boolean)
    return respostaBase({
      resposta: `Antes de continuar, informe ${faltam.join(" e ")}. Exemplo: “Somente atualizar na Nexa, a partir de agosto de 2026”. Nenhuma alteração foi realizada.`,
      confirmacaoAlteracaoPendente: confirmacao,
      consulta: { tipo: "confirmacao-alteracao-regime", titulo: `Alteração de regime — ${confirmacao.clienteNome}`, resumo: "Aguardando os dados obrigatórios.", total: 1, itens: [] },
    })
  }

  if (escopo === "processo-real") {
    return respostaBase({
      resposta: `Entendido. O cadastro de ${confirmacao.clienteNome} não foi alterado. Para o desenquadramento real a partir de ${periodo.competencia.split("-").reverse().join("/")}, confirme primeiro o motivo e a data de efeito no Portal do Simples Nacional; depois, retorne à Nexa para registrar o resultado oficial.`,
      confirmacaoAlteracaoConcluida: true,
      consulta: { tipo: "alteracao-regime-processo-real", titulo: `Desenquadramento real — ${confirmacao.clienteNome}`, resumo: "Orientação apresentada; nenhuma alteração automática foi realizada.", total: 0, itens: [] },
    })
  }

  if (!dadosColetados) {
    const competenciaFormatada = periodo.competencia.split("-").reverse().join("/")
    return respostaBase({
      resposta: `Revise antes de salvar: ${confirmacao.clienteNome} será alterado de ${confirmacao.regimeAtual || "regime não informado"} para ${confirmacao.regimePretendido || "Simples Nacional"}, a partir de ${competenciaFormatada}. As rotinas futuras de DAS-MEI serão encerradas, mas o histórico será preservado. Responda “confirmar” para executar ou “cancelar”. Nenhuma alteração foi realizada ainda.`,
      confirmacaoAlteracaoPendente: {
        ...confirmacao,
        dadosColetados: { escopo, periodo },
      },
      consulta: {
        tipo: "confirmacao-final-alteracao-regime",
        titulo: `Confirmação final — ${confirmacao.clienteNome}`,
        resumo: `${confirmacao.regimeAtual || "Não informado"} → ${confirmacao.regimePretendido || "Simples Nacional"} desde ${competenciaFormatada}.`,
        total: 1,
        itens: [{ clienteId: confirmacao.clienteId, cliente: confirmacao.clienteNome, status: "Aguardando confirmação final" }],
      },
    })
  }

  const cliente = await Cliente.findByPk(confirmacao.clienteId)
  if (!cliente) {
    return respostaBase({
      resposta: "O cliente não está mais disponível neste escritório. Nenhuma alteração foi realizada.",
      confirmacaoAlteracaoConcluida: true,
      consulta: { tipo: "alteracao-regime-cliente-indisponivel", titulo: "Cliente indisponível", resumo: "Alteração não realizada.", total: 0, itens: [] },
    })
  }

  const regimeAnterior = cliente.regime || null
  const regimeNovo = confirmacao.regimePretendido || "Simples Nacional"
  let fiscaisEncerrados = 0
  let guiasEncerradas = 0

  await sequelize.transaction(async (transaction) => {
    const observacaoHistorico = `Regime alterado de ${regimeAnterior || "não informado"} para ${regimeNovo}, com início em ${periodo.competencia}, pela Nexa Assistente.`
    await cliente.update({
      regime: regimeNovo,
      dataOpcaoRegime: periodo.dataInicio,
      observacoesTributarias: [cliente.observacoesTributarias, observacaoHistorico].filter(Boolean).join("\n"),
    }, { transaction })

    const fiscais = await Fiscal.findAll({ transaction })
    const futurosMei = fiscais.filter((item) => {
      const competencia = competenciaFiscal(item.competencia)
      const mesmoCliente = (cliente.empresaId && Number(item.empresaId) === Number(cliente.empresaId)) || normalizar(item.cliente) === normalizar(cliente.nome)
      return mesmoCliente && competencia && competencia >= periodo.competencia && /das.*mei|mei.*das/.test(normalizar(item.obrigacao)) && !encerrada(item.status)
    })
    for (const item of futurosMei) {
      await item.update({
        status: "Cancelado",
        alertaFiscal: "Encerrado por mudança de regime",
        observacao: [item.observacao, observacaoHistorico].filter(Boolean).join(" | "),
      }, { transaction })
    }
    fiscaisEncerrados = futurosMei.length

    const guias = await DasMei.findAll({
      where: { clienteId: cliente.id, competencia: { [Op.gte]: periodo.competencia }, rotinaAtiva: true },
      transaction,
    })
    for (const guia of guias) {
      await guia.update({
        rotinaAtiva: false,
        publicadoNoPortal: false,
        historico: [...(guia.historico || []), { em: new Date().toISOString(), acao: "Rotina encerrada por mudança de regime", competenciaInicio: periodo.competencia, usuarioId: usuario?.id || null }],
      }, { transaction })
    }
    guiasEncerradas = guias.length

    await HistoricoRegimeTributario.create({
      clienteId: cliente.id,
      usuarioId: usuario?.id || null,
      regimeAnterior,
      regimeNovo,
      competenciaInicio: periodo.competencia,
      dataInicio: periodo.dataInicio,
      escopo,
      motivo: String(mensagem || "").trim(),
      detalhes: { fiscaisEncerrados, guiasEncerradas },
    }, { transaction })
  })

  return respostaBase({
    resposta: `Cadastro de ${cliente.nome} atualizado de ${regimeAnterior || "regime não informado"} para ${regimeNovo}, a partir de ${periodo.competencia.split("-").reverse().join("/")}. O histórico anterior foi preservado. Foram encerradas ${guiasEncerradas} guia(s) futura(s) de DAS-MEI e ${fiscaisEncerrados} obrigação(ões) fiscal(is) futura(s).`,
    confirmacaoAlteracaoConcluida: true,
    clienteIdConfirmado: cliente.id,
    consulta: { tipo: "alteracao-regime-concluida", titulo: `Regime atualizado — ${cliente.nome}`, resumo: `${regimeAnterior || "Não informado"} → ${regimeNovo} desde ${periodo.competencia.split("-").reverse().join("/")}.`, total: 1, itens: [{ clienteId: cliente.id, cliente: cliente.nome, regimeAnterior, regimeNovo, competenciaInicio: periodo.competencia, fiscaisEncerrados, guiasEncerradas }] },
  })
}

module.exports = { responderConfirmacaoAlteracaoRegime }

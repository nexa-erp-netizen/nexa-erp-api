const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const CertificadoDigital = require("../models/CertificadoDigital")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")

function normalizar(valor) {
  return String(valor || "").trim().toLowerCase()
}

function concluido(status) {
  return [
    "pago",
    "recebido",
    "concluído",
    "concluido",
    "entregue",
    "quitado",
    "conferido",
  ].includes(normalizar(status))
}

function diasAte(data) {
  if (!data) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const alvo = new Date(`${String(data).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(alvo.getTime())) return null
  return Math.ceil((alvo.getTime() - hoje.getTime()) / 86400000)
}

function criarRecomendacao({ codigo, prioridade, categoria, titulo, opiniao, motivo, acao, evidencias = [] }) {
  return { codigo, prioridade, categoria, titulo, opiniao, motivo, acao, evidencias }
}

async function obterRecomendacoesCliente(req, res) {
  try {
    const clienteId = Number(req.params.clienteId)
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({ message: "Cliente inválido" })
    }

    const cliente = await Cliente.findByPk(clienteId)
    if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })

    if (
      req.usuario?.perfil === "Cliente" &&
      req.usuario?.clienteVinculado &&
      cliente.nome !== req.usuario.clienteVinculado
    ) {
      return res.status(403).json({ message: "Acesso não autorizado" })
    }

    const [fiscais, financeiros, documentos, certificados, procuracoes] = await Promise.all([
      Fiscal.findAll({ where: { cliente: cliente.nome }, order: [["createdAt", "DESC"]], limit: 100 }),
      Financeiro.findAll({ where: { cliente: cliente.nome }, order: [["createdAt", "DESC"]], limit: 100 }),
      DocumentoDigital.findAll({ where: { cliente: cliente.nome }, order: [["createdAt", "DESC"]], limit: 100 }),
      CertificadoDigital.findAll({ where: { clienteId }, order: [["dataValidade", "DESC"]] }),
      ProcuracaoEcac.findAll({ where: { clienteId }, order: [["dataValidade", "DESC"]] }),
    ])

    const recomendacoes = []
    const pendenciasFiscais = fiscais.filter((item) => !concluido(item.status))
    const pendenciasFinanceiras = financeiros.filter((item) => !concluido(item.status))
    const documentosPendentes = documentos.filter((item) => !concluido(item.status))

    const fiscaisVencidos = pendenciasFiscais.filter((item) => {
      const dias = diasAte(item.vencimento)
      return dias !== null && dias < 0
    })

    if (fiscaisVencidos.length) {
      recomendacoes.push(criarRecomendacao({
        codigo: "FISCAL_VENCIDO",
        prioridade: "Crítica",
        categoria: "Fiscal",
        titulo: "Regularizar obrigações fiscais vencidas",
        opiniao: "Na minha avaliação, esta é a prioridade imediata deste cliente.",
        motivo: `Encontrei ${fiscaisVencidos.length} obrigação(ões) fiscal(is) vencida(s) e ainda não concluída(s).`,
        acao: "Revisar a apuração, confirmar o status no órgão responsável e definir a regularização antes de novas rotinas.",
        evidencias: fiscaisVencidos.slice(0, 5).map((item) => `${item.obrigacao || "Obrigação"} • ${item.vencimento || "sem vencimento"}`),
      }))
    } else if (pendenciasFiscais.length) {
      recomendacoes.push(criarRecomendacao({
        codigo: "FISCAL_PENDENTE",
        prioridade: "Alta",
        categoria: "Fiscal",
        titulo: "Conferir pendências fiscais abertas",
        opiniao: "Recomendo revisar estas obrigações antes do próximo fechamento.",
        motivo: `Há ${pendenciasFiscais.length} obrigação(ões) fiscal(is) sem conclusão registrada.`,
        acao: "Conferir vencimentos, documentos e responsáveis; concluir ou reprogramar cada item.",
        evidencias: pendenciasFiscais.slice(0, 5).map((item) => `${item.obrigacao || "Obrigação"} • ${item.status || "Pendente"}`),
      }))
    }

    const financeiroAtrasado = pendenciasFinanceiras.filter((item) => {
      const status = normalizar(item.status)
      const dias = diasAte(item.vencimento)
      return status === "atrasado" || (dias !== null && dias < 0)
    })

    if (financeiroAtrasado.length) {
      recomendacoes.push(criarRecomendacao({
        codigo: "FINANCEIRO_ATRASADO",
        prioridade: "Alta",
        categoria: "Financeiro",
        titulo: "Tratar valores financeiros em atraso",
        opiniao: "Eu faria o contato com o cliente e registraria uma decisão de cobrança ou negociação.",
        motivo: `Existem ${financeiroAtrasado.length} lançamento(s) financeiro(s) vencido(s) sem baixa.`,
        acao: "Conferir recebimentos, contatar o cliente e atualizar o status dos lançamentos.",
        evidencias: financeiroAtrasado.slice(0, 5).map((item) => `${item.descricao || item.tipo || "Lançamento"} • ${item.valor || "sem valor"}`),
      }))
    }

    if (documentosPendentes.length) {
      recomendacoes.push(criarRecomendacao({
        codigo: "DOCUMENTOS_PENDENTES",
        prioridade: documentosPendentes.length >= 3 ? "Alta" : "Média",
        categoria: "Documentos",
        titulo: "Concluir documentos pendentes",
        opiniao: "Recomendo resolver os documentos antes que eles bloqueiem uma obrigação ou atendimento futuro.",
        motivo: `Há ${documentosPendentes.length} documento(s) sem conclusão registrada.`,
        acao: "Identificar o que depende do escritório e o que deve ser solicitado ao cliente.",
        evidencias: documentosPendentes.slice(0, 5).map((item) => `${item.tipo || "Documento"} • ${item.status || "Pendente"}`),
      }))
    }

    const certificado = certificados[0]
    if (!certificado) {
      recomendacoes.push(criarRecomendacao({
        codigo: "CERTIFICADO_AUSENTE",
        prioridade: "Média",
        categoria: "Identidade Digital",
        titulo: "Cadastrar ou confirmar o certificado digital",
        opiniao: "Como o e-CAC faz parte da rotina do escritório, considero importante manter esta informação completa.",
        motivo: "Nenhum certificado digital está cadastrado para este cliente.",
        acao: "Confirmar se o acesso ocorre por certificado próprio ou por procuração e registrar a situação na Nexa.",
      }))
    } else {
      const dias = diasAte(certificado.dataValidade)
      if (dias !== null && dias < 0) {
        recomendacoes.push(criarRecomendacao({
          codigo: "CERTIFICADO_VENCIDO",
          prioridade: "Crítica",
          categoria: "Identidade Digital",
          titulo: "Renovar certificado digital vencido",
          opiniao: "Recomendo iniciar a renovação imediatamente para evitar interrupção de acessos e obrigações.",
          motivo: `O certificado venceu há ${Math.abs(dias)} dia(s).`,
          acao: "Confirmar o responsável, iniciar a renovação e atualizar o novo prazo na Nexa.",
        }))
      } else if (dias !== null && dias <= 30) {
        recomendacoes.push(criarRecomendacao({
          codigo: "CERTIFICADO_PROXIMO",
          prioridade: dias <= 7 ? "Crítica" : "Alta",
          categoria: "Identidade Digital",
          titulo: "Planejar renovação do certificado digital",
          opiniao: "Eu não deixaria esta renovação para a última semana.",
          motivo: `O certificado vence em ${dias} dia(s).`,
          acao: "Criar tarefa de renovação, confirmar documentação e avisar o cliente.",
        }))
      }
    }

    const procuracao = procuracoes[0]
    if (!procuracao) {
      recomendacoes.push(criarRecomendacao({
        codigo: "PROCURACAO_AUSENTE",
        prioridade: "Baixa",
        categoria: "Identidade Digital",
        titulo: "Avaliar necessidade de procuração e-CAC",
        opiniao: "Se o escritório acessa o e-CAC deste cliente com frequência, uma procuração bem controlada reduz dependência do certificado dele.",
        motivo: "Nenhuma procuração e-CAC está cadastrada para este cliente.",
        acao: "Confirmar o método de acesso atual e cadastrar a procuração quando aplicável.",
      }))
    }

    if (!cliente.regime) {
      recomendacoes.push(criarRecomendacao({
        codigo: "DNA_INCOMPLETO",
        prioridade: "Alta",
        categoria: "Cadastro",
        titulo: "Completar o DNA tributário do cliente",
        opiniao: "Sem o regime tributário, qualquer análise da Nexa fica limitada e menos confiável.",
        motivo: "O regime tributário não está informado no cadastro.",
        acao: "Atualizar regime, ramo, anexo e demais dados tributários aplicáveis.",
      }))
    }

    if (!recomendacoes.length) {
      recomendacoes.push(criarRecomendacao({
        codigo: "SEM_RISCO_IMEDIATO",
        prioridade: "Baixa",
        categoria: "Geral",
        titulo: "Manter acompanhamento normal",
        opiniao: "Neste momento, não encontrei risco operacional imediato nos dados disponíveis.",
        motivo: "Não há pendências abertas relevantes nem alertas críticos identificados nesta consulta.",
        acao: "Manter a rotina programada e revisar novamente no próximo fechamento.",
      }))
    }

    const peso = { Crítica: 4, Alta: 3, Média: 2, Baixa: 1 }
    recomendacoes.sort((a, b) => (peso[b.prioridade] || 0) - (peso[a.prioridade] || 0))

    return res.json({
      cliente: { id: cliente.id, nome: cliente.nome, regime: cliente.regime, ramo: cliente.ramo },
      parecer: recomendacoes.some((item) => item.prioridade === "Crítica")
        ? "Encontrei situações críticas. Recomendo interromper a rotina normal deste cliente e tratar os itens prioritários primeiro."
        : recomendacoes.some((item) => item.prioridade === "Alta")
          ? "O cliente exige atenção. Há ações que devem ser incluídas no fluxo de trabalho atual."
          : "O cliente está sob controle nos dados disponíveis, com recomendações preventivas ou de melhoria.",
      recomendacoes,
      atualizadoEm: new Date().toISOString(),
      aviso: "As recomendações apoiam a decisão profissional e devem ser conferidas pelo contador antes da execução.",
    })
  } catch (error) {
    console.error("ERRO NO SEGUNDO CONTADOR:", error)
    return res.status(500).json({ message: "Erro ao gerar recomendações da Nexa" })
  }
}

module.exports = { obterRecomendacoesCliente }

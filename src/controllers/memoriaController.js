const Cliente = require("../models/Cliente")
const Fiscal = require("../models/Fiscal")
const Financeiro = require("../models/Financeiro")
const DocumentoDigital = require("../models/DocumentoDigital")
const MovimentoCliente = require("../models/MovimentoCliente")
const CertificadoDigital = require("../models/CertificadoDigital")
const ProcuracaoEcac = require("../models/ProcuracaoEcac")
const HistoricoEcac = require("../models/HistoricoEcac")

function dataIso(valor) {
  if (!valor) return null
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? null : data.toISOString()
}

function estaPendente(status) {
  const normalizado = String(status || "").trim().toLowerCase()
  return ![
    "pago",
    "recebido",
    "concluído",
    "concluido",
    "entregue",
    "quitado",
    "conferido",
  ].includes(normalizado)
}

async function obterMemoriaCliente(req, res) {
  try {
    const clienteId = Number(req.params.clienteId)

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({ message: "Cliente inválido" })
    }

    const cliente = await Cliente.findByPk(clienteId)

    if (!cliente) {
      return res.status(404).json({ message: "Cliente não encontrado" })
    }

    if (
      req.usuario?.perfil === "Cliente" &&
      req.usuario?.clienteVinculado &&
      cliente.nome !== req.usuario.clienteVinculado
    ) {
      return res.status(403).json({ message: "Acesso não autorizado" })
    }

    const nomeCliente = cliente.nome

    const [
      fiscais,
      financeiros,
      documentos,
      movimentos,
      certificados,
      procuracoes,
      acessosEcac,
    ] = await Promise.all([
      Fiscal.findAll({
        where: { cliente: nomeCliente },
        order: [["createdAt", "DESC"]],
        limit: 80,
      }),
      Financeiro.findAll({
        where: { cliente: nomeCliente },
        order: [["createdAt", "DESC"]],
        limit: 80,
      }),
      DocumentoDigital.findAll({
        where: { cliente: nomeCliente },
        order: [["createdAt", "DESC"]],
        limit: 80,
      }),
      MovimentoCliente.findAll({
        where: { cliente: nomeCliente },
        order: [["createdAt", "DESC"]],
        limit: 80,
      }),
      CertificadoDigital.findAll({
        where: { clienteId },
        order: [["dataValidade", "DESC"]],
      }),
      ProcuracaoEcac.findAll({
        where: { clienteId },
        order: [["dataValidade", "DESC"]],
      }),
      HistoricoEcac.findAll({
        where: { clienteId },
        order: [["createdAt", "DESC"]],
        limit: 30,
      }),
    ])

    const timeline = []

    fiscais.forEach((item) => {
      timeline.push({
        id: `fiscal-${item.id}`,
        tipo: "Fiscal",
        titulo: item.obrigacao || "Obrigação fiscal",
        descricao: `${item.competencia || "Sem competência"} • ${
          item.status || "Sem status"
        }`,
        status: item.status,
        data: dataIso(item.updatedAt || item.createdAt || item.vencimento),
        origem: "Fiscal",
      })
    })

    financeiros.forEach((item) => {
      timeline.push({
        id: `financeiro-${item.id}`,
        tipo: "Financeiro",
        titulo: item.descricao || item.tipo || "Movimentação financeira",
        descricao: `${item.tipo || "Movimento"} • ${
          item.status || "Sem status"
        } • ${item.valor || "R$ 0,00"}`,
        status: item.status,
        data: dataIso(item.updatedAt || item.createdAt || item.vencimento),
        origem: "Financeiro",
      })
    })

    documentos.forEach((item) => {
      timeline.push({
        id: `documento-${item.id}`,
        tipo: "Documento",
        titulo: item.tipo || "Documento digital",
        descricao: `${item.anoCalendario || ""} • ${
          item.status || "Sem status"
        }`.replace(/^ • /, ""),
        status: item.status,
        data: dataIso(item.updatedAt || item.createdAt || item.dataEnvio),
        origem: "Documentos Digitais",
      })
    })

    movimentos.forEach((item) => {
      timeline.push({
        id: `movimento-${item.id}`,
        tipo: "Movimento",
        titulo: item.descricao || "Movimento do cliente",
        descricao: `${item.tipo || ""} • ${item.status || ""}`.replace(
          /^ • | • $/g,
          ""
        ),
        status: item.status,
        data: dataIso(item.updatedAt || item.createdAt || item.data),
        origem: "Movimentos",
      })
    })

    acessosEcac.forEach((item) => {
      timeline.push({
        id: `ecac-${item.id}`,
        tipo: "e-CAC",
        titulo: item.servico || "Acesso e-CAC",
        descricao: `Acesso registrado por ${item.responsavel || "Nexa"}`,
        status: "Registrado",
        data: dataIso(item.createdAt),
        origem: "Central e-CAC",
      })
    })

    const anotacoes = Array.isArray(cliente.anotacoes) ? cliente.anotacoes : []

    anotacoes.forEach((item, indice) => {
      timeline.push({
        id: `anotacao-${indice}`,
        tipo: "Anotação",
        titulo: "Anotação do cliente",
        descricao:
          typeof item === "string"
            ? item
            : item?.texto || item?.descricao || "Anotação",
        status: "Registrada",
        data: dataIso(item?.data || item?.createdAt || cliente.updatedAt),
        origem: "Cadastro do Cliente",
      })
    })

    timeline.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")))

    const fiscaisPendentes = fiscais.filter((item) => estaPendente(item.status))
    const financeirosPendentes = financeiros.filter((item) =>
      estaPendente(item.status)
    )
    const documentosPendentes = documentos.filter((item) =>
      estaPendente(item.status)
    )

    const alertas = []

    if (!certificados[0]) alertas.push("Certificado digital não cadastrado.")
    if (!procuracoes[0]) alertas.push("Procuração e-CAC não cadastrada.")
    if (fiscaisPendentes.length) {
      alertas.push(`${fiscaisPendentes.length} pendência(s) fiscal(is) em aberto.`)
    }
    if (financeirosPendentes.length) {
      alertas.push(
        `${financeirosPendentes.length} pendência(s) financeira(s) em aberto.`
      )
    }
    if (documentosPendentes.length) {
      alertas.push(
        `${documentosPendentes.length} documento(s) aguardando conclusão.`
      )
    }

    return res.json({
      cliente: cliente.toJSON(),
      resumo: {
        texto: alertas.length
          ? `Encontrei ${alertas.length} ponto(s) de atenção para ${nomeCliente}. ${alertas.join(
              " "
            )}`
          : `${nomeCliente} está sem pendências identificadas nesta consulta.`,
        alertas,
        totais: {
          eventos: timeline.length,
          fiscais: fiscais.length,
          financeiros: financeiros.length,
          documentos: documentos.length,
          movimentos: movimentos.length,
          acessosEcac: acessosEcac.length,
          pendencias:
            fiscaisPendentes.length +
            financeirosPendentes.length +
            documentosPendentes.length,
        },
      },
      identidadeDigital: {
        certificado: certificados[0]?.toJSON() || null,
        procuracao: procuracoes[0]?.toJSON() || null,
      },
      proximasAcoes: Array.isArray(cliente.proximasAcoes)
        ? cliente.proximasAcoes
        : [],
      timeline: timeline.slice(0, 60),
      atualizadoEm: new Date().toISOString(),
    })
  } catch (error) {
    console.error("ERRO NA MEMÓRIA DA NEXA:", error)
    return res.status(500).json({ message: "Erro ao montar memória do cliente" })
  }
}

module.exports = { obterMemoriaCliente }

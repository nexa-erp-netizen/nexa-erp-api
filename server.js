require("dotenv").config()

const express = require("express")
const cors = require("cors")
const path = require("path")

const sequelize = require("./src/config/database")
const Cliente = require("./src/models/Cliente")
const Fiscal = require("./src/models/Fiscal")
const Financeiro = require("./src/models/Financeiro")
const Servico = require("./src/models/Servico")
const ServicoAvulso = require("./src/models/ServicoAvulso")
const Usuario = require("./src/models/Usuario")
const PlanoConta = require("./src/models/PlanoConta")
const LancamentoContabil = require("./src/models/LancamentoContabil")
const SolicitacaoCliente = require("./src/models/SolicitacaoCliente")
const DocumentoDigital = require("./src/models/DocumentoDigital")
const Agenda = require("./src/models/Agenda")
const Empresa = require("./src/models/Empresa")
const ContaReceber = require("./src/models/ContaReceber")
const FluxoCaixa = require("./src/models/FluxoCaixa")
const usuariosRoutes = require("./src/routes/usuariosRoutes")
const MovimentoCliente = require("./src/models/MovimentoCliente")
const Notificacao = require("./src/models/Notificacao")
const FormaPagamento = require("./src/models/FormaPagamento")
const Declaracao = require("./src/models/Declaracao")
const CertificadoDigital = require("./src/models/CertificadoDigital")
const ProcuracaoEcac = require("./src/models/ProcuracaoEcac")
const HistoricoEcac = require("./src/models/HistoricoEcac")
const VocabularioVozNexa = require("./src/models/VocabularioVozNexa")
const GoogleDriveConexao = require("./src/models/GoogleDriveConexao")
const GoogleDrivePastaCliente = require("./src/models/GoogleDrivePastaCliente")
require("./src/models/NFeConfiguracao")
require("./src/models/ProdutoNFe")
require("./src/models/NFe")
require("./src/models/NFSeConfiguracao")
require("./src/models/ServicoNFSe")
require("./src/models/NFSe")
require("./src/models/AuditoriaIntegracaoChatGPT")
require("./src/models/DasMei")
require("./src/models/WhatsAppAssistEnvio")
const { autenticar } = require("./src/middlewares/authMiddleware")

const clientesRoutes = require("./src/routes/clientesRoutes")
const fiscalRoutes = require("./src/routes/fiscalRoutes")
const financeiroRoutes = require("./src/routes/financeiroRoutes")
const servicosRoutes = require("./src/routes/servicosRoutes")
const servicosAvulsosRoutes = require("./src/routes/servicosAvulsosRoutes")
const authRoutes = require("./src/routes/authRoutes")
const planoContasRoutes = require("./src/routes/planoContasRoutes")
const lancamentosContabeisRoutes = require("./src/routes/lancamentosContabeisRoutes")
const solicitacoesClientesRoutes = require("./src/routes/solicitacoesClientesRoutes")
const documentosDigitaisRoutes = require("./src/routes/documentosDigitaisRoutes")
const relatoriosRoutes = require("./src/routes/relatoriosRoutes")
const backupRoutes = require("./src/routes/backupRoutes")
const agendaRoutes = require("./src/routes/agendaRoutes")
const empresasRoutes = require("./src/routes/empresasRoutes")
const contasReceberRoutes = require("./src/routes/contasReceberRoutes")
const fluxoCaixaRoutes = require("./src/routes/fluxoCaixaRoutes")
const movimentosClienteRoutes = require("./src/routes/movimentosClienteRoutes")
const notificacoesRoutes = require("./src/routes/notificacoesRoutes")
const formasPagamentoRoutes = require("./src/routes/formasPagamentoRoutes")
const declaracoesRoutes = require("./src/routes/declaracoesRoutes")
const certificadosDigitaisRoutes = require("./src/routes/certificadosDigitaisRoutes")
const procuracoesEcacRoutes = require("./src/routes/procuracoesEcacRoutes")
const ecacRoutes = require("./src/routes/ecacRoutes")
const memoriaRoutes = require("./src/routes/memoriaRoutes")
const recomendacoesRoutes = require("./src/routes/recomendacoesRoutes")
const consultoriaTributariaRoutes = require("./src/routes/consultoriaTributariaRoutes")
const conversaRoutes = require("./src/routes/conversaRoutes")
const googleDriveRoutes = require("./src/routes/googleDriveRoutes")
const chatgptIntegrationRoutes = require("./src/routes/chatgptIntegrationRoutes")
const nfeRoutes = require("./src/routes/nfeRoutes")
const nfseRoutes = require("./src/routes/nfseRoutes")
const credenciaisFiscaisRoutes = require("./src/routes/credenciaisFiscaisRoutes")
const dasMeiRoutes = require("./src/routes/dasMeiRoutes")
const whatsappAssistRoutes = require("./src/routes/whatsappAssistRoutes")

const app = express()

app.use(cors())
app.use(express.json())

app.use(
  "/uploads",
  express.static(
    path.resolve(__dirname, "uploads")
  )
)

app.use(
  "/uploads",
  express.static(
    path.resolve(__dirname, "src", "uploads")
  )
)
app.use("/clientes", clientesRoutes)
app.use("/fiscal", fiscalRoutes)
app.use("/financeiro", financeiroRoutes)
app.use("/servicos", servicosRoutes)
app.use("/servicos-avulsos", servicosAvulsosRoutes)
app.use("/plano-contas", planoContasRoutes)
app.use("/lancamentos-contabeis", lancamentosContabeisRoutes)
app.use("/relatorios", relatoriosRoutes)
app.use("/solicitacoes-clientes", solicitacoesClientesRoutes)
app.use("/documentos-digitais", documentosDigitaisRoutes)
app.use("/movimentos-cliente", movimentosClienteRoutes)
app.use("/backup", backupRoutes)
app.use("/agenda", agendaRoutes)
app.use("/empresas", empresasRoutes)
app.use("/contas-receber", contasReceberRoutes)
app.use("/fluxo-caixa", fluxoCaixaRoutes)
app.use("/usuarios", usuariosRoutes)
app.use("/notificacoes", notificacoesRoutes)
app.use("/formas-pagamento", formasPagamentoRoutes)
app.use("/declaracoes", declaracoesRoutes)
app.use("/certificados-digitais", certificadosDigitaisRoutes)
app.use("/procuracoes-ecac", procuracoesEcacRoutes)
app.use("/ecac", ecacRoutes)
app.use("/memoria", memoriaRoutes)
app.use("/recomendacoes", recomendacoesRoutes)
app.use("/consultoria-tributaria", consultoriaTributariaRoutes)
app.use("/conversa", conversaRoutes)
app.use("/google-drive", googleDriveRoutes)
app.use("/integracoes/chatgpt", chatgptIntegrationRoutes)
app.use("/nfe", nfeRoutes)
app.use("/nfse", nfseRoutes)
app.use("/credenciais-fiscais", credenciaisFiscaisRoutes)
app.use("/das-mei", dasMeiRoutes)
app.use("/whatsapp-assist", whatsappAssistRoutes)
app.use("/auth", authRoutes)

app.get("/dashboard", autenticar, async (req, res) => {
  try {
    const totalClientes = await Cliente.count()

    const lancamentos = await Financeiro.findAll()
    const obrigacoes = await Fiscal.findAll()
    const lancamentosContabeis =
      await LancamentoContabil.findAll()

    function valorNumerico(valorFormatado) {
      return Number(
        String(valorFormatado || 0)
          .replace("R$", "")
          .replace(/\./g, "")
          .replace(",", ".")
          .trim()
      )
    }

    function statusAutomatico(item) {
      if (
        item.status === "Pago" ||
        item.status === "Recebido"
      ) {
        return item.status
      }

      if (
        item.vencimento &&
        new Date(item.vencimento) < new Date()
      ) {
        return "Atrasado"
      }

      return item.status || "Pendente"
    }

    const financeiroTratado = lancamentos.map((item) => ({
      ...item.dataValues,
      statusCalculado: statusAutomatico(item),
    }))

    const recebido = financeiroTratado
      .filter(
        (item) =>
          item.tipo === "Receber" &&
          (item.statusCalculado === "Recebido" ||
            item.statusCalculado === "Pago")
      )
      .reduce(
        (total, item) => total + valorNumerico(item.valor),
        0
      )

    const totalReceber = financeiroTratado
      .filter(
        (item) =>
          item.tipo === "Receber" &&
          item.statusCalculado !== "Pago" &&
          item.statusCalculado !== "Recebido"
      )
      .reduce(
        (total, item) => total + valorNumerico(item.valor),
        0
      )

    const totalPagar = financeiroTratado
      .filter(
        (item) =>
          item.tipo === "Pagar" &&
          item.statusCalculado !== "Pago" &&
          item.statusCalculado !== "Recebido"
      )
      .reduce(
        (total, item) => total + valorNumerico(item.valor),
        0
      )

    const inadimplentes = financeiroTratado.filter(
      (item) => item.statusCalculado === "Atrasado"
    )

    const resumoPorCliente = {}

    financeiroTratado.forEach((item) => {
      const nomeCliente =
        item.cliente || "Sem cliente"

      if (!resumoPorCliente[nomeCliente]) {
        resumoPorCliente[nomeCliente] = {
          cliente: nomeCliente,
          receitas: 0,
          despesas: 0,
          resultado: 0,
          lancamentos: 0,
        }
      }

      if (item.tipo === "Receber") {
        resumoPorCliente[nomeCliente].receitas +=
          valorNumerico(item.valor)
      }

      if (item.tipo === "Pagar") {
        resumoPorCliente[nomeCliente].despesas +=
          valorNumerico(item.valor)
      }

      resumoPorCliente[nomeCliente].resultado =
        resumoPorCliente[nomeCliente].receitas -
        resumoPorCliente[nomeCliente].despesas

      resumoPorCliente[nomeCliente].lancamentos += 1
    })

    const resumoPorCentroCusto = {}

    financeiroTratado.forEach((item) => {
      const centro =
        item.centroCusto ||
        item.centro_custo ||
        "Sem centro de custo"

      if (!resumoPorCentroCusto[centro]) {
        resumoPorCentroCusto[centro] = {
          centroCusto: centro,
          receitas: 0,
          despesas: 0,
          resultado: 0,
          lancamentos: 0,
        }
      }

      if (item.tipo === "Receber") {
        resumoPorCentroCusto[centro].receitas +=
          valorNumerico(item.valor)
      }

      if (item.tipo === "Pagar") {
        resumoPorCentroCusto[centro].despesas +=
          valorNumerico(item.valor)
      }

      resumoPorCentroCusto[centro].resultado =
        resumoPorCentroCusto[centro].receitas -
        resumoPorCentroCusto[centro].despesas

      resumoPorCentroCusto[centro].lancamentos += 1
    })

    const obrigacoesPendentes = obrigacoes.filter(
      (item) =>
        item.status === "Pendente" ||
        item.status === "Atrasado"
    )

    const obrigacoesAtrasadas = obrigacoes.filter(
      (item) => item.status === "Atrasado"
    )

    const topClientes = Object.values(resumoPorCliente)
      .sort((a, b) => b.receitas - a.receitas)
      .slice(0, 5)

    const topCentrosCusto = Object.values(
      resumoPorCentroCusto
    )
      .sort((a, b) => b.receitas - a.receitas)
      .slice(0, 5)

    res.json({
      totalClientes,

      recebido,
      totalReceber,
      totalPagar,
      inadimplentes: inadimplentes.length,
      saldoPrevisto: recebido + totalReceber - totalPagar,
      saldoRealizado: recebido - totalPagar,

      saldo: recebido + totalReceber - totalPagar,

      obrigacoesPendentes: obrigacoesPendentes.length,
      obrigacoesAtrasadas: obrigacoesAtrasadas.length,
      ultimasObrigacoes: obrigacoesPendentes.slice(0, 10),

      resumoPorCliente: Object.values(resumoPorCliente),
      resumoPorCentroCusto: Object.values(resumoPorCentroCusto),

      topClientes,
      topCentrosCusto,
    })
  } catch (error) {
    console.error("ERRO NO DASHBOARD:", error)

    res.status(500).json({
      message: "Erro ao carregar dashboard",
    })
  }
})
  app.get("/", (req, res) => {
  res.json({
    message: "API Nexa ERP funcionando 🚀",
  })
})

const PORT = 3000

sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("PostgreSQL conectado com sucesso 🚀")

    app.listen(PORT, () => {
      console.log(
        `Servidor rodando na porta ${PORT}`
      )
    })
  })
  .catch((error) => {
    console.error(
      "Erro ao conectar PostgreSQL:",
      error
    )
  })

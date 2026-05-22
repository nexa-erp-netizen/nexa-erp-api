const express = require("express")
const cors = require("cors")
const path = require("path")

const sequelize = require("./src/config/database")
const Cliente = require("./src/models/Cliente")
const Fiscal = require("./src/models/Fiscal")
const Financeiro = require("./src/models/Financeiro")
const Servico = require("./src/models/Servico")
const Usuario = require("./src/models/Usuario")
const PlanoConta = require("./src/models/PlanoConta")
const LancamentoContabil = require("./src/models/LancamentoContabil")
const SolicitacaoCliente = require("./src/models/SolicitacaoCliente")
const DocumentoDigital = require("./src/models/DocumentoDigital")
const Agenda = require("./src/models/Agenda")
const Empresa = require("./src/models/Empresa")

const clientesRoutes = require("./src/routes/clientesRoutes")
const fiscalRoutes = require("./src/routes/fiscalRoutes")
const financeiroRoutes = require("./src/routes/financeiroRoutes")
const servicosRoutes = require("./src/routes/servicosRoutes")
const authRoutes = require("./src/routes/authRoutes")
const planoContasRoutes = require("./src/routes/planoContasRoutes")
const lancamentosContabeisRoutes = require("./src/routes/lancamentosContabeisRoutes")
const solicitacoesClientesRoutes = require("./src/routes/solicitacoesClientesRoutes")
const documentosDigitaisRoutes = require("./src/routes/documentosDigitaisRoutes")
const relatoriosRoutes = require("./src/routes/relatoriosRoutes")
const backupRoutes = require("./src/routes/backupRoutes")
const agendaRoutes = require("./src/routes/agendaRoutes")
const empresasRoutes = require("./src/routes/empresasRoutes")

const app = express()

app.use(cors())
app.use(express.json())

app.use(
  "/uploads",
  express.static(
    path.resolve(__dirname, "uploads")
  )
)

app.use("/clientes", clientesRoutes)
app.use("/fiscal", fiscalRoutes)
app.use("/financeiro", financeiroRoutes)
app.use("/servicos", servicosRoutes)
app.use("/plano-contas", planoContasRoutes)
app.use("/lancamentos-contabeis", lancamentosContabeisRoutes)
app.use("/relatorios", relatoriosRoutes)
app.use("/solicitacoes-clientes", solicitacoesClientesRoutes)
app.use("/documentos-digitais", documentosDigitaisRoutes)
app.use("/backup", backupRoutes)
app.use("/agenda", agendaRoutes)
app.use("/empresas", empresasRoutes)
app.use("/auth", authRoutes)

app.get("/dashboard", async (req, res) => {
  try {
    const totalClientes = await Cliente.count()

    const lancamentos = await Financeiro.findAll()
    const obrigacoes = await Fiscal.findAll()
    const lancamentosContabeis =
      await LancamentoContabil.findAll()

    function valorNumerico(valorFormatado) {
      return Number(
        String(valorFormatado)
          .replace("R$", "")
          .replace(/\./g, "")
          .replace(",", ".")
          .trim()
      )
    }

    const totalReceber = lancamentos
      .filter((item) => item.tipo === "Receber")
      .reduce(
        (total, item) => total + valorNumerico(item.valor),
        0
      )

    const totalPagar = lancamentos
      .filter((item) => item.tipo === "Pagar")
      .reduce(
        (total, item) => total + valorNumerico(item.valor),
        0
      )

    const resumoPorCliente = {}

    lancamentosContabeis.forEach((item) => {
      if (!resumoPorCliente[item.cliente]) {
        resumoPorCliente[item.cliente] = {
          cliente: item.cliente,
          receitas: 0,
          despesas: 0,
          resultado: 0,
          lancamentos: 0,
        }
      }

      if (item.tipo === "Receita") {
        resumoPorCliente[item.cliente].receitas += valorNumerico(item.valor)
      }

      if (item.tipo === "Despesa") {
        resumoPorCliente[item.cliente].despesas += valorNumerico(item.valor)
      }

      resumoPorCliente[item.cliente].resultado =
        resumoPorCliente[item.cliente].receitas -
        resumoPorCliente[item.cliente].despesas

      resumoPorCliente[item.cliente].lancamentos += 1
    })

    const obrigacoesPendentes = obrigacoes.filter(
      (item) =>
        item.status === "Pendente" ||
        item.status === "Atrasado"
    )

    const obrigacoesAtrasadas = obrigacoes.filter(
      (item) => item.status === "Atrasado"
    )

    res.json({
      totalClientes,
      totalReceber,
      totalPagar,
      saldo: totalReceber - totalPagar,
      obrigacoesPendentes: obrigacoesPendentes.length,
      obrigacoesAtrasadas: obrigacoesAtrasadas.length,
      ultimasObrigacoes: obrigacoesPendentes.slice(0, 10),
      resumoPorCliente: Object.values(resumoPorCliente),
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
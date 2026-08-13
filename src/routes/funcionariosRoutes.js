const express = require("express")
const { Op } = require("sequelize")
const Funcionario = require("../models/Funcionario")
const Cliente = require("../models/Cliente")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

const TEXTO = ["matricula", "nome", "nomeSocial", "cpf", "rg", "orgaoEmissorRg", "sexo", "estadoCivil", "nacionalidade", "naturalidade", "nomeMae", "nomePai", "escolaridade", "email", "telefone", "cep", "endereco", "numero", "complemento", "bairro", "cidade", "estado", "ctpsNumero", "ctpsSerie", "ctpsUf", "pisPasepNit", "tituloEleitor", "zonaEleitoral", "secaoEleitoral", "certificadoReservista", "cnh", "cnhCategoria", "tipoContrato", "cargo", "cbo", "departamento", "localTrabalho", "tipoSalario", "horarioTrabalho", "intervalo", "sindicato", "categoriaTrabalhador", "eSocialMatricula", "regimePrevidenciario", "banco", "agencia", "conta", "tipoConta", "chavePix", "formaPagamento", "motivoDesligamento", "status", "observacoes"]
const DATAS = ["dataEmissaoRg", "dataNascimento", "cnhValidade", "dataAdmissao", "dataFimContrato", "dataFimExperiencia", "dataOpcaoFgts", "exameAdmissionalData", "exameAdmissionalValidade", "dataDesligamento"]
const NUMEROS = ["salarioBase", "jornadaSemanal", "valorValeTransporte", "valorValeAlimentacao", "insalubridadePercentual"]
const BOOLEANOS = ["ctpsDigital", "optanteFgts", "valeTransporte", "valeAlimentacao", "planoSaude", "periculosidade"]

function somenteDigitos(valor) {
  return String(valor || "").replace(/\D/g, "")
}

function limpar(body, cliente) {
  const dados = {
    clienteId: cliente.id,
    cliente: cliente.nome,
    dependentes: Array.isArray(body.dependentes) ? body.dependentes : [],
    beneficios: Array.isArray(body.beneficios) ? body.beneficios : [],
    documentos: Array.isArray(body.documentos) ? body.documentos : [],
  }
  TEXTO.forEach((campo) => { dados[campo] = String(body[campo] || "").trim() || null })
  DATAS.forEach((campo) => { dados[campo] = body[campo] || null })
  NUMEROS.forEach((campo) => { dados[campo] = body[campo] === "" || body[campo] === null || body[campo] === undefined ? null : Number(body[campo]) })
  BOOLEANOS.forEach((campo) => { dados[campo] = body[campo] === true })
  dados.cpf = somenteDigitos(body.cpf)
  dados.status = dados.status || "Ativo"
  dados.tipoContrato = dados.tipoContrato || "Prazo indeterminado"
  dados.tipoSalario = dados.tipoSalario || "Mensal"
  dados.categoriaTrabalhador = dados.categoriaTrabalhador || "101 - Empregado geral"
  dados.regimePrevidenciario = dados.regimePrevidenciario || "RGPS"
  dados.formaPagamento = dados.formaPagamento || "Transferência bancária"
  return dados
}

function validar(dados) {
  if (!dados.nome || !dados.cpf || !dados.dataNascimento || !dados.dataAdmissao || !dados.cargo) return "Nome, CPF, nascimento, admissão e cargo são obrigatórios."
  if (dados.cpf.length !== 11) return "Informe um CPF válido com 11 dígitos."
  if (!Number.isFinite(dados.salarioBase) || dados.salarioBase < 0) return "Informe um salário-base válido."
  if (dados.dataFimContrato && dados.dataFimContrato < dados.dataAdmissao) return "O fim do contrato não pode ser anterior à admissão."
  return ""
}

async function clienteDoCadastro(clienteId) {
  const id = Number(clienteId)
  return id ? Cliente.findByPk(id) : null
}

router.use(autenticar)
router.use((req, res, next) => {
  if (req.usuario.perfil === "Cliente") return res.status(403).json({ message: "Dados trabalhistas disponíveis somente para o escritório." })
  next()
})

router.get("/", async (req, res) => {
  try {
    const where = {}
    if (req.query.clienteId) where.clienteId = Number(req.query.clienteId)
    if (req.query.status) where.status = req.query.status
    if (req.query.busca) {
      const busca = `%${String(req.query.busca).trim()}%`
      where[Op.or] = [{ nome: { [Op.iLike]: busca } }, { cpf: { [Op.iLike]: busca } }, { cargo: { [Op.iLike]: busca } }, { matricula: { [Op.iLike]: busca } }]
    }
    const itens = await Funcionario.findAll({ where, order: [["status", "ASC"], ["nome", "ASC"]] })
    res.json(itens)
  } catch (error) {
    console.error("ERRO AO LISTAR FUNCIONÁRIOS:", error)
    res.status(500).json({ message: "Erro ao listar funcionários" })
  }
})

router.get("/:id", async (req, res) => {
  try {
    const item = await Funcionario.findByPk(req.params.id)
    if (!item) return res.status(404).json({ message: "Funcionário não encontrado" })
    res.json(item)
  } catch (error) {
    console.error("ERRO AO ABRIR FUNCIONÁRIO:", error)
    res.status(500).json({ message: "Erro ao abrir funcionário" })
  }
})

router.post("/", async (req, res) => {
  try {
    const cliente = await clienteDoCadastro(req.body.clienteId)
    if (!cliente) return res.status(400).json({ message: "Selecione uma empresa válida." })
    const dados = limpar(req.body, cliente)
    const erro = validar(dados)
    if (erro) return res.status(400).json({ message: erro })
    const repetido = await Funcionario.findOne({ where: { clienteId: cliente.id, cpf: dados.cpf, status: { [Op.ne]: "Excluído" } } })
    if (repetido) return res.status(409).json({ message: "Este CPF já está cadastrado nessa empresa." })
    const item = await Funcionario.create(dados)
    res.status(201).json(item)
  } catch (error) {
    console.error("ERRO AO CADASTRAR FUNCIONÁRIO:", error)
    res.status(500).json({ message: "Erro ao cadastrar funcionário" })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const item = await Funcionario.findByPk(req.params.id)
    if (!item) return res.status(404).json({ message: "Funcionário não encontrado" })
    const cliente = await clienteDoCadastro(req.body.clienteId || item.clienteId)
    if (!cliente) return res.status(400).json({ message: "Empresa não encontrada." })
    const dados = limpar(req.body, cliente)
    const erro = validar(dados)
    if (erro) return res.status(400).json({ message: erro })
    const repetido = await Funcionario.findOne({ where: { id: { [Op.ne]: item.id }, clienteId: cliente.id, cpf: dados.cpf, status: { [Op.ne]: "Excluído" } } })
    if (repetido) return res.status(409).json({ message: "Este CPF já está cadastrado nessa empresa." })
    await item.update(dados)
    res.json(item)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR FUNCIONÁRIO:", error)
    res.status(500).json({ message: "Erro ao atualizar funcionário" })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const item = await Funcionario.findByPk(req.params.id)
    if (!item) return res.status(404).json({ message: "Funcionário não encontrado" })
    await item.update({ status: "Excluído" })
    res.json({ message: "Funcionário removido do cadastro" })
  } catch (error) {
    console.error("ERRO AO EXCLUIR FUNCIONÁRIO:", error)
    res.status(500).json({ message: "Erro ao excluir funcionário" })
  }
})

module.exports = router

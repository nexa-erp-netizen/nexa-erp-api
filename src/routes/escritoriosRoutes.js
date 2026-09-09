const express = require("express")
const bcrypt = require("bcryptjs")
const sequelize = require("../config/database")
const Escritorio = require("../models/Escritorio")
const Usuario = require("../models/Usuario")
const { Op } = require("sequelize")
const { salvarBackup } = require("./backupRoutes")
const { validarArquivamentoEscritorio, confirmacaoNomeValida } = require("../services/arquivamentoSeguroService")
const { exigirAdministradorPlataforma } = require("../utils/acessoPlataforma")

const router = express.Router()

function normalizarCodigo(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function gerarCodigoDisponivel(nome) {
  const base = normalizarCodigo(nome) || "escritorio"
  let codigo = base
  let sufixo = 2

  while (await Escritorio.findOne({ where: { codigo }, semIsolamentoEscritorio: true })) {
    codigo = `${base}-${sufixo}`
    sufixo += 1
  }

  return codigo
}

router.use(exigirAdministradorPlataforma)

router.get("/", async (req, res) => {
  const arquivados = req.query.arquivados === "true"
  const escritorios = await Escritorio.findAll({ where: { arquivadoEm: arquivados ? { [Op.not]: null } : null }, order: [["nome", "ASC"]], semIsolamentoEscritorio: true })
  const admins = await Usuario.findAll({ where: { plataformaAdmin: true }, attributes: ["escritorioId"], semIsolamentoEscritorio: true })
  const protegidos = new Set(admins.map(item => Number(item.escritorioId)))
  res.json(escritorios.map(item => ({ ...item.toJSON(), protegido: protegidos.has(Number(item.id)) })))
})

router.delete("/:id", async (req, res) => {
  const escritorio = await Escritorio.findByPk(req.params.id, { semIsolamentoEscritorio: true })
  const existe = validarArquivamentoEscritorio(escritorio, req.usuario, false)
  if (!existe.permitido) return res.status(existe.status).json({ message: existe.mensagem })
  const possuiAdminPlataforma = await Usuario.count({ where: { escritorioId: escritorio.id, plataformaAdmin: true }, semIsolamentoEscritorio: true })
  const permissao = validarArquivamentoEscritorio(escritorio, req.usuario, possuiAdminPlataforma > 0)
  if (!permissao.permitido) return res.status(permissao.status).json({ message: permissao.mensagem })
  if (!confirmacaoNomeValida(escritorio.nome, req.body?.confirmacaoNome)) {
    return res.status(400).json({ message: "Digite exatamente o nome do escritório para confirmar" })
  }
  if (escritorio.arquivadoEm) return res.json({ message: "Escritório já estava excluído com segurança" })

  try {
    const reqBackup = { ...req, usuario: { ...req.usuario, escritorioId: escritorio.id } }
    const backup = await salvarBackup({ origem: "antes-de-excluir-escritorio", req: reqBackup, prefixo: `backup-escritorio-${escritorio.id}` })
    await escritorio.update({ status: "Arquivado", arquivadoEm: new Date(), arquivadoPorUsuarioId: req.usuario.id }, { semIsolamentoEscritorio: true })
    return res.json({ message: "Escritório excluído com segurança", backup: { arquivo: backup.arquivo, checksumSha256: backup.checksumSha256 } })
  } catch (error) {
    console.error("ERRO AO EXCLUIR ESCRITÓRIO:", error)
    return res.status(500).json({ message: "Não foi possível gerar o backup e excluir o escritório" })
  }
})

router.patch("/:id/restaurar", async (req, res) => {
  const escritorio = await Escritorio.findByPk(req.params.id, { semIsolamentoEscritorio: true })
  if (!escritorio) return res.status(404).json({ message: "Escritório não encontrado" })
  if (!escritorio.arquivadoEm) return res.status(409).json({ message: "Este escritório não está excluído" })
  await escritorio.update({ status: "Ativo", arquivadoEm: null, arquivadoPorUsuarioId: null }, { semIsolamentoEscritorio: true })
  return res.json({ message: "Escritório restaurado com sucesso" })
})

router.post("/", async (req, res) => {
  const { nome, codigo, cnpj, email, telefone, plano, adminNome, adminEmail, adminSenha } = req.body
  const adminPerfil = req.body.adminPerfil === "Empresa" ? "Empresa" : "Administrador"
  const codigoLimpo = normalizarCodigo(codigo) || await gerarCodigoDisponivel(nome)

  if (!nome || !adminNome || !adminEmail || !adminSenha) {
    return res.status(400).json({ message: "Preencha o escritório e os dados do usuário responsável" })
  }

  const transacao = await sequelize.transaction()
  try {
    const escritorio = await Escritorio.create(
      { nome, codigo: codigoLimpo, cnpj, email, telefone, plano: plano || "Profissional" },
      { transaction: transacao, semIsolamentoEscritorio: true }
    )
    const senha = await bcrypt.hash(adminSenha, 10)
    const usuario = await Usuario.create(
      { nome: adminNome, email: adminEmail, senha, perfil: adminPerfil, escritorioId: escritorio.id },
      { transaction: transacao, semIsolamentoEscritorio: true }
    )
    await transacao.commit()
    res.status(201).json({
      escritorio,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
      administrador: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    })
  } catch (error) {
    await transacao.rollback()
    const duplicado = error?.name === "SequelizeUniqueConstraintError"
    res.status(duplicado ? 400 : 500).json({ message: duplicado ? "Código ou e-mail já cadastrado" : "Erro ao criar escritório" })
  }
})

module.exports = router

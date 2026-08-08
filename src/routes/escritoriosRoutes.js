const express = require("express")
const bcrypt = require("bcryptjs")
const sequelize = require("../config/database")
const Escritorio = require("../models/Escritorio")
const Usuario = require("../models/Usuario")

const router = express.Router()

function somentePlataforma(req, res, next) {
  if (!req.usuario?.plataformaAdmin) {
    return res.status(403).json({ message: "Acesso exclusivo da administração da plataforma" })
  }
  next()
}

router.get("/", somentePlataforma, async (_req, res) => {
  const escritorios = await Escritorio.findAll({ order: [["nome", "ASC"]], semIsolamentoEscritorio: true })
  res.json(escritorios)
})

router.post("/", somentePlataforma, async (req, res) => {
  const { nome, codigo, cnpj, email, telefone, plano, adminNome, adminEmail, adminSenha } = req.body
  const codigoLimpo = String(codigo || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")

  if (!nome || !codigoLimpo || !adminNome || !adminEmail || !adminSenha) {
    return res.status(400).json({ message: "Preencha escritório, código e dados do administrador" })
  }

  const transacao = await sequelize.transaction()
  try {
    const escritorio = await Escritorio.create(
      { nome, codigo: codigoLimpo, cnpj, email, telefone, plano: plano || "Profissional" },
      { transaction: transacao, semIsolamentoEscritorio: true }
    )
    const senha = await bcrypt.hash(adminSenha, 10)
    const usuario = await Usuario.create(
      { nome: adminNome, email: adminEmail, senha, perfil: "Administrador", escritorioId: escritorio.id },
      { transaction: transacao, semIsolamentoEscritorio: true }
    )
    await transacao.commit()
    res.status(201).json({ escritorio, administrador: { id: usuario.id, nome: usuario.nome, email: usuario.email } })
  } catch (error) {
    await transacao.rollback()
    const duplicado = error?.name === "SequelizeUniqueConstraintError"
    res.status(duplicado ? 400 : 500).json({ message: duplicado ? "Código ou e-mail já cadastrado" : "Erro ao criar escritório" })
  }
})

module.exports = router

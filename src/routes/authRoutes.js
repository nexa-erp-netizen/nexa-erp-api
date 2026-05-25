const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const Usuario = require("../models/Usuario")

const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET || "nexa_segredo_temporario"

router.post("/registrar", async (req, res) => {
  try {
    const {
      nome,
      email,
      senha,
      perfil,
      clienteVinculado,
      empresaId,
    } = req.body

    if (!nome || !email || !senha || !perfil) {
      return res.status(400).json({
        message: "Preencha todos os campos",
      })
    }

    const usuarioExiste = await Usuario.findOne({
      where: { email },
    })

    if (usuarioExiste) {
      return res.status(400).json({
        message: "Este e-mail já está cadastrado",
      })
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10)

    const usuario = await Usuario.create({
      nome,
      email,
      senha: senhaCriptografada,
      perfil,
      clienteVinculado,
      empresaId,
    })

    res.status(201).json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      clienteVinculado: usuario.clienteVinculado,
      empresaId: usuario.empresaId,
    })
  } catch (error) {
    console.error("ERRO AO REGISTRAR USUÁRIO:", error)

    res.status(500).json({
      message: "Erro ao registrar usuário",
    })
  }
})

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body

    if (!email || !senha) {
      return res.status(400).json({
        message: "Preencha e-mail e senha",
      })
    }

    const usuario = await Usuario.findOne({
      where: { email },
    })

    if (!usuario) {
      return res.status(401).json({
        message: "Usuário ou senha inválidos",
      })
    }

    const senhaCorreta = await bcrypt.compare(
      senha,
      usuario.senha
    )

    if (!senhaCorreta) {
      return res.status(401).json({
        message: "Usuário ou senha inválidos",
      })
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        perfil: usuario.perfil,
      },
      JWT_SECRET,
      {
        expiresIn: "8h",
      }
    )

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
    })
  } catch (error) {
    console.error("ERRO AO FAZER LOGIN:", error)

    res.status(500).json({
      message: "Erro ao fazer login",
    })
  }
})

module.exports = router
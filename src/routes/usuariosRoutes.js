const express = require("express")
const bcrypt = require("bcryptjs")
const Usuario = require("../models/Usuario")
const Cliente = require("../models/Cliente")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

router.get("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    const usuarios = await Usuario.findAll({
      attributes: [
        "id",
        "nome",
        "email",
        "perfil",
        "clienteVinculado",
        "empresaId",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    })

    res.json(usuarios)
  } catch (error) {
    console.error("ERRO AO LISTAR USUÁRIOS:", error)

    res.status(500).json({
      message: "Erro ao listar usuários",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    const {
      nome,
      email,
      senha,
      perfil,
      clienteVinculado,
    } = req.body

    if (!nome || !email || !senha || !perfil) {
      return res.status(400).json({
        message: "Preencha todos os campos",
      })
    }

    if (perfil === "Cliente" && !clienteVinculado) {
      return res.status(400).json({
        message: "Selecione o cliente vinculado",
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
      clienteVinculado:
        perfil === "Cliente" ? clienteVinculado : null,
      empresaId: req.usuario.empresaId || null,
    })

    res.status(201).json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      clienteVinculado: usuario.clienteVinculado,
    })
  } catch (error) {
    console.error("ERRO AO CRIAR USUÁRIO:", error)

    res.status(500).json({
      message: "Erro ao criar usuário",
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    const usuario = await Usuario.findByPk(req.params.id)

    if (!usuario) {
      return res.status(404).json({
        message: "Usuário não encontrado",
      })
    }

    const {
      nome,
      email,
      senha,
      perfil,
      clienteVinculado,
    } = req.body

    const dadosAtualizados = {
      nome,
      email,
      perfil,
      clienteVinculado:
        perfil === "Cliente" ? clienteVinculado : null,
    }

    if (senha) {
      dadosAtualizados.senha = await bcrypt.hash(senha, 10)
    }

    await usuario.update(dadosAtualizados)

    res.json({
      message: "Usuário atualizado com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO ATUALIZAR USUÁRIO:", error)

    res.status(500).json({
      message: "Erro ao atualizar usuário",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    const usuario = await Usuario.findByPk(req.params.id)

    if (!usuario) {
      return res.status(404).json({
        message: "Usuário não encontrado",
      })
    }

    await usuario.destroy()

    res.json({
      message: "Usuário excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR USUÁRIO:", error)

    res.status(500).json({
      message: "Erro ao excluir usuário",
    })
  }
})

module.exports = router
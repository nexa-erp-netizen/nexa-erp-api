const express = require("express")
const bcrypt = require("bcryptjs")
const Usuario = require("../models/Usuario")
const Cliente = require("../models/Cliente")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()
const PERFIS_PERMITIDOS = ["Administrador", "Empresa", "Funcionário", "Cliente"]

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
        "ativo",
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

    if (!PERFIS_PERMITIDOS.includes(perfil)) {
      return res.status(400).json({ message: "Perfil de usuário inválido" })
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
    const clientePortalBloqueado = perfil === "Cliente"
      ? await Cliente.findOne({ where: { nome: clienteVinculado, portalBloqueado: true } })
      : null

    const usuario = await Usuario.create({
      nome,
      email,
      senha: senhaCriptografada,
      perfil,
      clienteVinculado:
        perfil === "Cliente" ? clienteVinculado : null,
      empresaId: req.usuario.empresaId || null,
      ativo: !clientePortalBloqueado,
      bloqueadoPeloCliente: Boolean(clientePortalBloqueado),
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

    if (!PERFIS_PERMITIDOS.includes(perfil)) {
      return res.status(400).json({ message: "Perfil de usuário inválido" })
    }

    const dadosAtualizados = {
      nome,
      email,
      perfil,
      clienteVinculado:
        perfil === "Cliente" ? clienteVinculado : null,
    }

    if (perfil === "Cliente" && clienteVinculado) {
      const clientePortalBloqueado = await Cliente.findOne({
        where: { nome: clienteVinculado, escritorioId: usuario.escritorioId, portalBloqueado: true },
      })
      if (clientePortalBloqueado) {
        dadosAtualizados.ativo = false
        dadosAtualizados.bloqueadoPeloCliente = true
      }
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

router.patch("/:id/acesso", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") {
      return res.status(403).json({ message: "Acesso não autorizado" })
    }

    const usuario = await Usuario.findByPk(req.params.id)
    if (!usuario) return res.status(404).json({ message: "Usuário não encontrado" })

    if (Number(usuario.id) === Number(req.usuario.id) && req.body.ativo === false) {
      return res.status(400).json({ message: "Você não pode bloquear o próprio acesso" })
    }

    const ativo = req.body.ativo === true
    if (ativo && usuario.perfil === "Cliente" && usuario.clienteVinculado) {
      const cliente = await Cliente.findOne({
        where: {
          nome: usuario.clienteVinculado,
          escritorioId: usuario.escritorioId,
          portalBloqueado: true,
        },
      })
      if (cliente) {
        return res.status(409).json({
          message: "O Portal deste cliente está bloqueado. Desbloqueie-o primeiro na Central do Cliente.",
        })
      }
    }
    await usuario.update({ ativo })

    return res.json({
      id: usuario.id,
      ativo,
      message: ativo ? "Usuário desbloqueado com sucesso" : "Usuário bloqueado com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO ALTERAR ACESSO DO USUÁRIO:", error)
    return res.status(500).json({ message: "Erro ao alterar acesso do usuário" })
  }
})

module.exports = router

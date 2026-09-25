const express = require("express")
const bcrypt = require("bcryptjs")
const { Op } = require("sequelize")
const Usuario = require("../models/Usuario")
const Cliente = require("../models/Cliente")
const UsuarioCliente = require("../models/UsuarioCliente")
const sequelize = require("../config/database")
const { salvarBackup } = require("./backupRoutes")
const { validarArquivamentoUsuario } = require("../services/arquivamentoSeguroService")
const {
  clientesVinculadosAoUsuario,
  substituirClientesDoUsuario,
  idsUnicos,
} = require("../services/usuarioClienteService")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()
const PERFIS_PERMITIDOS = ["Administrador", "Empresa", "Funcionário", "Cliente"]

async function resolverClienteIds({ clienteIds, clienteVinculado, escritorioId, transaction = null }) {
  const ids = idsUnicos(clienteIds)
  if (ids.length || !clienteVinculado) return ids
  const cliente = await Cliente.findOne({
    where: { nome: clienteVinculado, ...(escritorioId ? { escritorioId } : {}) },
    transaction,
  })
  return cliente ? [cliente.id] : []
}

router.get("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    const arquivados = req.query.arquivados === "true"
    const usuarios = await Usuario.findAll({
      where: { arquivadoEm: arquivados ? { [Op.not]: null } : null },
      attributes: [
        "id",
        "nome",
        "email",
        "perfil",
        "clienteVinculado",
        "empresaId",
        "ativo",
        "plataformaAdmin",
        "arquivadoEm",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    })

    const resposta = await Promise.all(usuarios.map(async usuario => {
      const dados = usuario.toJSON()
      const clientesVinculados = usuario.perfil === "Cliente"
        ? await clientesVinculadosAoUsuario(usuario)
        : []
      return {
        ...dados,
        clienteIds: clientesVinculados.map(cliente => cliente.id),
        clientesVinculados,
      }
    }))

    res.json(resposta)
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
      clienteIds,
      clientePrincipalId,
    } = req.body

    if (!nome || !email || !senha || !perfil) {
      return res.status(400).json({
        message: "Preencha todos os campos",
      })
    }

    if (!PERFIS_PERMITIDOS.includes(perfil)) {
      return res.status(400).json({ message: "Perfil de usuário inválido" })
    }

    if (perfil === "Empresa") {
      return res.status(409).json({
        message: "Cadastre a Empresa com um código de acesso para criar um escritório isolado",
      })
    }

    const idsClientes = perfil === "Cliente"
      ? await resolverClienteIds({ clienteIds, clienteVinculado, escritorioId: req.usuario.escritorioId })
      : []

    if (perfil === "Cliente" && !idsClientes.length) {
      return res.status(400).json({
        message: "Selecione ao menos uma empresa vinculada",
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
    const usuario = await sequelize.transaction(async transaction => {
      const criado = await Usuario.create({
        nome,
        email,
        senha: senhaCriptografada,
        perfil,
        clienteVinculado: perfil === "Cliente" ? clienteVinculado : null,
        empresaId: req.usuario.empresaId || null,
        escritorioId: req.usuario.escritorioId,
        ativo: true,
        bloqueadoPeloCliente: false,
      }, { transaction })
      if (perfil === "Cliente") {
        await substituirClientesDoUsuario(criado, idsClientes, clientePrincipalId, transaction)
      }
      return criado
    })

    const vinculos = perfil === "Cliente" ? await clientesVinculadosAoUsuario(usuario) : []

    res.status(201).json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      clienteVinculado: usuario.clienteVinculado,
      clienteIds: vinculos.map(cliente => cliente.id),
      clientesVinculados: vinculos,
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

    if (usuario.arquivadoEm) return res.status(409).json({ message: "Restaure o usuário antes de alterá-lo" })

    const {
      nome,
      email,
      senha,
      perfil,
      clienteVinculado,
      clienteIds,
      clientePrincipalId,
    } = req.body

    if (!PERFIS_PERMITIDOS.includes(perfil)) {
      return res.status(400).json({ message: "Perfil de usuário inválido" })
    }

    const idsClientes = perfil === "Cliente"
      ? await resolverClienteIds({ clienteIds, clienteVinculado, escritorioId: usuario.escritorioId })
      : []
    if (perfil === "Cliente" && !idsClientes.length) {
      return res.status(400).json({ message: "Selecione ao menos uma empresa vinculada" })
    }

    const dadosAtualizados = { nome, email, perfil, clienteVinculado: perfil === "Cliente" ? clienteVinculado : null }

    if (senha) {
      dadosAtualizados.senha = await bcrypt.hash(senha, 10)
    }

    await sequelize.transaction(async transaction => {
      await usuario.update(dadosAtualizados, { transaction })
      if (perfil === "Cliente") {
        await substituirClientesDoUsuario(usuario, idsClientes, clientePrincipalId, transaction)
      } else {
        await UsuarioCliente.update(
          { ativo: false, principal: false },
          { where: { usuarioId: usuario.id, escritorioId: usuario.escritorioId }, transaction },
        )
      }
    })

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

    const permissao = validarArquivamentoUsuario(usuario, req.usuario)
    if (!permissao.permitido) return res.status(permissao.status).json({ message: permissao.mensagem })
    if (usuario.arquivadoEm) return res.json({ message: "Usuário já estava excluído com segurança" })

    const backup = await salvarBackup({ origem: "antes-de-excluir-usuario", req, prefixo: `backup-usuario-${usuario.id}` })
    await usuario.update({ ativo: false, arquivadoEm: new Date(), arquivadoPorUsuarioId: req.usuario.id })

    res.json({
      message: "Usuário excluído com segurança",
      backup: { arquivo: backup.arquivo, checksumSha256: backup.checksumSha256 },
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR USUÁRIO:", error)

    res.status(500).json({
      message: "Erro ao excluir usuário",
    })
  }
})

router.patch("/:id/restaurar", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") return res.status(403).json({ message: "Acesso não autorizado" })
    const usuario = await Usuario.findByPk(req.params.id)
    if (!usuario) return res.status(404).json({ message: "Usuário não encontrado" })
    if (!usuario.arquivadoEm) return res.status(409).json({ message: "Este usuário não está excluído" })

    let ativo = true
    if (usuario.perfil === "Cliente") {
      const clientes = await clientesVinculadosAoUsuario(usuario)
      ativo = clientes.some(cliente => !cliente.portalBloqueado)
    }
    await usuario.update({ ativo, arquivadoEm: null, arquivadoPorUsuarioId: null })
    return res.json({ message: ativo ? "Usuário restaurado com sucesso" : "Usuário restaurado, mas permanece bloqueado pelo Portal do Cliente", ativo })
  } catch (error) {
    console.error("ERRO AO RESTAURAR USUÁRIO:", error)
    return res.status(500).json({ message: "Erro ao restaurar usuário" })
  }
})

router.patch("/:id/acesso", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Administrador") {
      return res.status(403).json({ message: "Acesso não autorizado" })
    }

    const usuario = await Usuario.findByPk(req.params.id)
    if (!usuario) return res.status(404).json({ message: "Usuário não encontrado" })
    if (usuario.arquivadoEm) return res.status(409).json({ message: "Restaure o usuário antes de alterar o acesso" })

    if (Number(usuario.id) === Number(req.usuario.id) && req.body.ativo === false) {
      return res.status(400).json({ message: "Você não pode bloquear o próprio acesso" })
    }

    const ativo = req.body.ativo === true
    if (ativo && usuario.perfil === "Cliente") {
      const clientes = await clientesVinculadosAoUsuario(usuario)
      if (!clientes.some(cliente => !cliente.portalBloqueado)) {
        return res.status(409).json({
          message: "Todos os Portais vinculados a este usuário estão bloqueados. Desbloqueie ao menos uma empresa primeiro.",
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

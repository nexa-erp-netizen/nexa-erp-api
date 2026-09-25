const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { Op } = require("sequelize")
const Usuario = require("../models/Usuario")
const Cliente = require("../models/Cliente")
const Escritorio = require("../models/Escritorio")
const { registrarLoginEscritorio } = require("../services/acessoEscritorioService")
const { autenticar } = require("../middlewares/authMiddleware")
const AcessoCliente = require("../models/AcessoCliente")
const UsuarioCliente = require("../models/UsuarioCliente")
const {
  clientesVinculadosAoUsuario,
  escolherClienteAtivo,
  substituirClientesDoUsuario,
} = require("../services/usuarioClienteService")

const router = express.Router()

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET não configurado")
  }

  return "nexa_segredo_temporario"
}

function somenteAdmin(req, res, next) {
  if (req.usuario.perfil !== "Administrador") {
    return res.status(403).json({ message: "Acesso negado" })
  }

  next()
}

function limparDocumento(valor) {
  return String(valor || "").replace(/\D/g, "")
}

async function localizarUsuarioPorLogin(loginInformado, codigoEscritorio) {
  const login = String(loginInformado || "").trim()
  const documento = limparDocumento(login)
  let escritorioId = null

  if (codigoEscritorio) {
    const escritorio = await Escritorio.findOne({
      where: { codigo: String(codigoEscritorio).trim().toLowerCase() },
      semIsolamentoEscritorio: true,
    })
    if (!escritorio || escritorio.status !== "Ativo") return null
    escritorioId = escritorio.id
  }

  const filtroEscritorio = escritorioId ? { escritorioId } : {}

  let usuario = await Usuario.findOne({
    where: {
      ...filtroEscritorio,
      [Op.or]: [
        { email: login },
        { nome: login },
      ],
    },
  })

  if (usuario) return usuario

  if (documento) {
    const cliente = await Cliente.findOne({
      where: {
        ...filtroEscritorio,
        [Op.or]: [
          { cpf: documento },
          { cnpj: documento },
          { cpf: login },
          { cnpj: login },
        ],
      },
    })

    if (cliente) {
      const vinculo = await UsuarioCliente.findOne({
        where: {
          clienteId: cliente.id,
          escritorioId: cliente.escritorioId,
          ativo: true,
        },
        order: [["principal", "DESC"], ["createdAt", "ASC"]],
        semIsolamentoEscritorio: true,
      })
      usuario = vinculo
        ? await Usuario.findByPk(vinculo.usuarioId, { semIsolamentoEscritorio: true })
        : await Usuario.findOne({
            where: {
              escritorioId: cliente.escritorioId,
              clienteVinculado: cliente.nome,
            },
            semIsolamentoEscritorio: true,
          })
    }
  }

  return usuario
}

function criarToken(usuario, clienteAtivo = null) {
  return jwt.sign(
    {
      id: usuario.id,
      email: usuario.email,
      perfil: usuario.perfil,
      clienteId: clienteAtivo?.id || null,
      clienteVinculado: clienteAtivo?.nome || usuario.clienteVinculado,
      empresaId: usuario.empresaId,
      escritorioId: usuario.escritorioId,
      plataformaAdmin: Boolean(usuario.plataformaAdmin),
    },
    getJwtSecret(),
    { expiresIn: "8h" },
  )
}

function respostaUsuario(usuario, clienteAtivo = null, clientesVinculados = [], escritorio = null) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    clienteId: clienteAtivo?.id || null,
    clienteVinculado: clienteAtivo?.nome || usuario.clienteVinculado,
    clientesVinculados,
    empresaId: usuario.empresaId,
    escritorioId: usuario.escritorioId,
    plataformaAdmin: Boolean(usuario.plataformaAdmin),
    escritorio,
  }
}

router.post("/identificar-acesso", async (req, res) => {
  try {
    const login = String(req.body.login || req.body.email || "").trim()

    if (!login) {
      return res.status(400).json({ message: "Informe o usuário" })
    }

    const documento = limparDocumento(login)
    const usuarios = await Usuario.findAll({
      where: {
        [Op.or]: [
          { email: login },
          { nome: login },
        ],
      },
      attributes: ["perfil"],
      semIsolamentoEscritorio: true,
    })

    let existeCliente = usuarios.some((usuario) => usuario.perfil === "Cliente")
    const existeEscritorio = usuarios.some((usuario) => usuario.perfil !== "Cliente")

    if (!existeCliente && documento) {
      const cliente = await Cliente.findOne({
        where: {
          [Op.or]: [
            { cpf: documento },
            { cnpj: documento },
            { cpf: login },
            { cnpj: login },
          ],
        },
        attributes: ["id"],
        semIsolamentoEscritorio: true,
      })
      existeCliente = Boolean(cliente)
    }

    // Em caso de login repetido entre perfis, o código mantém a seleção segura.
    res.json({ exigeCodigoEscritorio: existeEscritorio || !existeCliente })
  } catch (error) {
    console.error("ERRO AO IDENTIFICAR TIPO DE ACESSO:", error)
    res.status(500).json({ message: "Erro ao identificar acesso" })
  }
})

router.post("/registrar", autenticar, somenteAdmin, async (req, res) => {
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

    if (perfil === "Cliente" && !clienteVinculado) {
      return res.status(400).json({
        message: "Selecione o cliente vinculado",
      })
    }

    const usuarioExiste = await Usuario.findOne({
      where: { email, escritorioId: req.usuario.escritorioId },
    })

    if (usuarioExiste) {
      return res.status(400).json({
        message: "Este e-mail já está cadastrado",
      })
    }

    const senhaCriptografada = await bcrypt.hash(
      senha,
      10
    )
    const clienteSelecionado = perfil === "Cliente"
      ? await Cliente.findOne({ where: { nome: clienteVinculado, escritorioId: req.usuario.escritorioId } })
      : null
    if (perfil === "Cliente" && !clienteSelecionado) {
      return res.status(400).json({ message: "Cliente vinculado não encontrado neste escritório" })
    }

    const usuario = await Usuario.create({
      nome,
      email,
      senha: senhaCriptografada,
      perfil,
      clienteVinculado:
        perfil === "Cliente" ? clienteVinculado : null,
      empresaId: empresaId || null,
      escritorioId: req.usuario.escritorioId,
      ativo: true,
      bloqueadoPeloCliente: false,
    })
    if (clienteSelecionado) {
      await substituirClientesDoUsuario(usuario, [clienteSelecionado.id], clienteSelecionado.id)
    }

    res.status(201).json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      clienteVinculado: usuario.clienteVinculado,
      empresaId: usuario.empresaId,
      escritorioId: usuario.escritorioId,
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
    const login = req.body.login || req.body.email
    const { senha, escritorioCodigo } = req.body

    if (!login || !senha) {
      return res.status(400).json({
        message: "Preencha usuário, CPF, e-mail ou CNPJ e senha",
      })
    }

    const usuario = await localizarUsuarioPorLogin(login, escritorioCodigo)

    if (!usuario) {
      return res.status(401).json({
        message: "Usuário ou senha inválidos",
      })
    }

    if (usuario.ativo === false || usuario.arquivadoEm) {
      return res.status(403).json({
        message: "Este acesso está bloqueado. Procure o administrador do escritório.",
      })
    }

    if (!usuario.plataformaAdmin && usuario.escritorioId) {
      const escritorio = await Escritorio.findByPk(usuario.escritorioId, { semIsolamentoEscritorio: true })
      if (!escritorio || escritorio.arquivadoEm || escritorio.status === "Arquivado") {
        return res.status(403).json({ message: "Este escritório está arquivado. Entre em contato com a administração da plataforma." })
      }
    }

    if (usuario.perfil !== "Cliente" && !escritorioCodigo && !usuario.plataformaAdmin) {
      return res.status(400).json({
        message: "Informe o código do escritório",
        exigeCodigoEscritorio: true,
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

    const escritorioAcessado = usuario.escritorioId
      ? await Escritorio.findByPk(usuario.escritorioId, { semIsolamentoEscritorio: true })
      : null
    await registrarLoginEscritorio(escritorioAcessado, usuario, req)

    const clientesVinculados = usuario.perfil === "Cliente"
      ? await clientesVinculadosAoUsuario(usuario)
      : []
    const documentoLogin = limparDocumento(login)
    const clientePeloDocumento = documentoLogin
      ? clientesVinculados.find(cliente => limparDocumento(cliente.cpf) === documentoLogin || limparDocumento(cliente.cnpj) === documentoLogin)
      : null
    const clienteAtivo = usuario.perfil === "Cliente"
      ? escolherClienteAtivo(clientesVinculados, clientePeloDocumento?.id)
      : null

    if (usuario.perfil === "Cliente" && !clienteAtivo) {
      return res.status(403).json({ message: "Este acesso não possui empresa vinculada. Procure o escritório." })
    }

    if (clienteAtivo?.portalBloqueado) {
      return res.status(403).json({
        message: "O Portal desta empresa está temporariamente bloqueado. Entre em contato com o escritório para regularização.",
        portalBloqueado: true,
      })
    }

    const token = criarToken(usuario, clienteAtivo)

    if (usuario.perfil === "Cliente") {
      await AcessoCliente.create({
        usuarioId: usuario.id,
        clienteId: clienteAtivo?.id || null,
        clienteNome: clienteAtivo?.nome || usuario.clienteVinculado || usuario.nome,
        tipo: "login",
        pagina: "Portal Cliente",
        descricao: "Entrada no Portal",
        ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim().slice(0, 80),
        dispositivo: String(req.headers["user-agent"] || "").slice(0, 255),
        escritorioId: usuario.escritorioId,
      })
    }

    res.json({
      token,
      usuario: respostaUsuario(usuario, clienteAtivo, clientesVinculados, escritorioAcessado),
    })
  } catch (error) {
    console.error("ERRO AO FAZER LOGIN:", error)

    res.status(500).json({
      message: "Erro ao fazer login",
    })
  }
})

router.post("/selecionar-cliente", autenticar, async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(req.usuario.id, { semIsolamentoEscritorio: true })
    if (!usuario || usuario.perfil !== "Cliente") {
      return res.status(403).json({ message: "A seleção de empresa é exclusiva do Portal do Cliente." })
    }

    const clientesVinculados = await clientesVinculadosAoUsuario(usuario)
    const clienteAtivo = escolherClienteAtivo(clientesVinculados, req.body.clienteId)
    if (!clienteAtivo || Number(clienteAtivo.id) !== Number(req.body.clienteId)) {
      return res.status(403).json({ message: "Esta empresa não está vinculada ao seu acesso." })
    }
    if (clienteAtivo.portalBloqueado) {
      return res.status(403).json({
        message: "O Portal desta empresa está temporariamente bloqueado. Entre em contato com o escritório.",
        portalBloqueado: true,
      })
    }

    const escritorio = usuario.escritorioId
      ? await Escritorio.findByPk(usuario.escritorioId, { semIsolamentoEscritorio: true })
      : null
    return res.json({
      token: criarToken(usuario, clienteAtivo),
      usuario: respostaUsuario(usuario, clienteAtivo, clientesVinculados, escritorio),
    })
  } catch (error) {
    console.error("ERRO AO SELECIONAR EMPRESA DO CLIENTE:", error)
    return res.status(500).json({ message: "Erro ao selecionar empresa" })
  }
})

module.exports = router

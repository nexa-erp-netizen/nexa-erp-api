const express = require("express")
const fs = require("fs")
const Cliente = require("../models/Cliente")
const Usuario = require("../models/Usuario")
const sequelize = require("../config/database")
const upload = require("../middlewares/upload")
const supabase = require("../config/supabase")
const Credencial = require("../models/CredencialAcessoFiscal")
const HistoricoCredencial = require("../models/HistoricoCredencialFiscal")
const { criptografar, chaveConfigurada } = require("../services/cofreCredenciaisService")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

function limparDadosCliente(body) {
  const { senhaGovBr: _senhaGovBr, ...dadosSemSenha } = body
  return {
    ...dadosSemSenha,
    ativo: body.ativo !== false,
    dataNascimento: body.dataNascimento || null,
    email: body.email || null,
    cnpj: body.cnpj || null,
    regime: body.regime || null,
    ramoAtividade: body.ramoAtividade || null,
    anexoSimples: body.regime === "Simples Nacional" ? (body.anexoSimples || null) : null,
    utilizaFatorR: body.regime === "Simples Nacional" ? (body.utilizaFatorR || null) : null,
    aliquotaIss: body.aliquotaIss === "" || body.aliquotaIss === undefined ? null : body.aliquotaIss,
    dataOpcaoRegime: body.dataOpcaoRegime || null,
    dataInicioAtividades: body.dataInicioAtividades || null,
    situacaoEmpresa: body.situacaoEmpresa || "Ativa",
    observacoesTributarias: body.observacoesTributarias || null,
    cep: body.cep || null,
    endereco: body.endereco || null,
    numero: body.numero || null,
    bairro: body.bairro || null,
    complemento: body.complemento || null,
    cidade: body.cidade || null,
    estado: body.estado || null,
    tituloEleitor: body.tituloEleitor || null,
    codigoSimplesNacional: body.codigoSimplesNacional || null,
    cnaePrincipal: body.cnaePrincipal || null,
    inscricaoMunicipal: body.inscricaoMunicipal || null,
    inscricaoEstadual: body.inscricaoEstadual || null,
    alvara: body.alvara || null,
    observacao: body.observacao || null,
    anexos: body.anexos || [],
    anotacoes: Array.isArray(body.anotacoes) ? body.anotacoes : [],
    proximasAcoes: Array.isArray(body.proximasAcoes) ? body.proximasAcoes : [],
  }
}

function clienteSemSenha(cliente, possuiSenhaCriptografada = false) {
  const dados = cliente?.toJSON ? cliente.toJSON() : { ...cliente }
  const possuiSenhaGovBr = Boolean(dados.senhaGovBr || possuiSenhaCriptografada)
  delete dados.senhaGovBr
  return { ...dados, possuiSenhaGovBr }
}

async function salvarSenhaGovBr({ cliente, senha, req, transaction }) {
  if (!senha) return null
  if (req.usuario?.perfil !== "Administrador") {
    const erro = new Error("Somente o administrador pode cadastrar a senha Gov.br.")
    erro.status = 403
    throw erro
  }
  if (!chaveConfigurada()) {
    const erro = new Error("O cofre ainda não foi ativado no servidor.")
    erro.status = 503
    throw erro
  }

  const where = { clienteId: cliente.id, metodo: "GOV_BR" }
  let credencial = await Credencial.findOne({ where, transaction })
  const dados = {
    cliente: cliente.nome,
    identificador: cliente.cpf || cliente.cnpj || null,
    segredoCriptografado: criptografar(senha),
    status: "Configurado",
    atualizadoPor: req.usuario?.nome || req.usuario?.email || `ID ${req.usuario?.id || "-"}`,
    ativo: true,
  }
  if (credencial) await credencial.update(dados, { transaction })
  else {
    credencial = await Credencial.create({
      ...dados,
      ...where,
      criadoPor: dados.atualizadoPor,
    }, { transaction })
  }
  await cliente.update({ senhaGovBr: null }, { transaction })
  await HistoricoCredencial.create({
    credencialId: credencial.id,
    clienteId: cliente.id,
    cliente: cliente.nome,
    metodo: "GOV_BR",
    acao: credencial.createdAt?.getTime?.() === credencial.updatedAt?.getTime?.() ? "Cadastro" : "Atualização",
    usuario: dados.atualizadoPor,
    detalhes: "Senha Gov.br armazenada no cofre criptografado.",
  }, { transaction })
  return credencial
}

function extrairPathSupabase(valor) {
  if (!valor) return ""

  if (!valor.startsWith("http")) {
    return valor
  }

  const marcador = "/storage/v1/object/public/nexa-uploads/"

  if (valor.includes(marcador)) {
    return valor.split(marcador)[1]
  }

  return valor
}

async function obterClienteDoUsuario(req) {
  if (req.usuario?.perfil !== "Cliente" || !req.usuario?.clienteVinculado) {
    return null
  }

  return Cliente.findOne({
    where: { nome: req.usuario.clienteVinculado },
  })
}

function cadastroVisivelAoCliente(cliente) {
  return {
    nome: cliente.nome,
    cpf: cliente.cpf,
    cnpj: cliente.cnpj,
    telefone: cliente.telefone,
    email: cliente.email,
    cep: cliente.cep,
    endereco: cliente.endereco,
    numero: cliente.numero,
    complemento: cliente.complemento,
    bairro: cliente.bairro,
    cidade: cliente.cidade,
    estado: cliente.estado,
  }
}

function textoLimitado(valor, limite) {
  return String(valor || "").trim().slice(0, limite) || null
}

function dadosCadastraisPermitidos(body) {
  return {
    telefone: textoLimitado(body.telefone, 30) || "",
    email: textoLimitado(body.email, 160),
    cep: textoLimitado(body.cep, 10),
    endereco: textoLimitado(body.endereco, 180),
    numero: textoLimitado(body.numero, 30),
    complemento: textoLimitado(body.complemento, 100),
    bairro: textoLimitado(body.bairro, 100),
    cidade: textoLimitado(body.cidade, 100),
    estado: textoLimitado(body.estado, 2)?.toUpperCase() || null,
  }
}

router.get("/meu-cadastro", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Cliente") {
      return res.status(403).json({ message: "Acesso exclusivo do cliente." })
    }

    const cliente = await obterClienteDoUsuario(req)

    if (!cliente) {
      return res.status(404).json({ message: "Cadastro vinculado não encontrado." })
    }

    res.json(cadastroVisivelAoCliente(cliente))
  } catch (error) {
    console.error("ERRO AO CARREGAR CADASTRO DO CLIENTE:", error)
    res.status(500).json({ message: "Erro ao carregar dados cadastrais." })
  }
})

router.put("/meu-cadastro", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil !== "Cliente") {
      return res.status(403).json({ message: "Acesso exclusivo do cliente." })
    }

    const cliente = await obterClienteDoUsuario(req)

    if (!cliente) {
      return res.status(404).json({ message: "Cadastro vinculado não encontrado." })
    }

    const dados = dadosCadastraisPermitidos(req.body || {})
    const email = dados.email || ""
    const cep = String(dados.cep || "").replace(/\D/g, "")

    if (!dados.telefone) {
      return res.status(400).json({ message: "Informe um telefone para contato." })
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Informe um e-mail válido." })
    }

    if (cep && cep.length !== 8) {
      return res.status(400).json({ message: "Informe um CEP válido com 8 números." })
    }

    if (dados.estado && !/^[A-Z]{2}$/.test(dados.estado)) {
      return res.status(400).json({ message: "Informe a UF com duas letras." })
    }

    await cliente.update(dados)
    res.json(cadastroVisivelAoCliente(cliente))
  } catch (error) {
    console.error("ERRO AO ATUALIZAR CADASTRO PELO CLIENTE:", error)
    res.status(500).json({ message: "Erro ao atualizar dados cadastrais." })
  }
})

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) {
        return res.json([])
      }

      where.nome = req.usuario.clienteVinculado
    }

    const clientes = await Cliente.findAll({
      where,
      order: [["createdAt", "DESC"]],
    })

    const idsComSenha = new Set((await Credencial.findAll({
      where: { metodo: "GOV_BR", ativo: true },
      attributes: ["clienteId"],
    })).map((item) => String(item.clienteId)))

    res.json(clientes.map((cliente) => clienteSemSenha(cliente, idsComSenha.has(String(cliente.id)))))
  } catch (error) {
    console.error("ERRO AO LISTAR CLIENTES:", error)

    res.status(500).json({
      message: "Erro ao listar clientes",
    })
  }
})

router.get("/anexo-url", autenticar, async (req, res) => {
  try {
    const bucket =
      process.env.SUPABASE_BUCKET ||
      "nexa-uploads"

    const path = extrairPathSupabase(req.query.path)

    if (!path) {
      return res.status(400).json({
        message: "Caminho do anexo não informado.",
      })
    }

    const { data, error } =
      await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 5)

    if (error) {
      throw error
    }

    res.json({
      url: data.signedUrl,
    })
  } catch (error) {
    console.error("ERRO AO GERAR URL DO ANEXO DO CLIENTE:", error)

    res.status(500).json({
      message: "Erro ao gerar URL do anexo.",
    })
  }
})

router.post(
  "/upload",
  autenticar,
  upload.array("arquivos"),
  async (req, res) => {
    try {
      if (req.usuario.perfil === "Cliente") {
        return res.status(403).json({
          message: "Cliente não pode anexar arquivos no cadastro",
        })
      }

      const bucket =
        process.env.SUPABASE_BUCKET ||
        "nexa-uploads"

      const arquivos = []

      for (const file of req.files || []) {
        const nomeLimpo = file.originalname
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9.\-_]/g, "-")
          .replace(/-+/g, "-")

        const caminhoArquivo =
          `clientes/${Date.now()}-${nomeLimpo}`

        const buffer =
          file.buffer ||
          fs.readFileSync(file.path)

        const { error } =
          await supabase.storage
            .from(bucket)
            .upload(caminhoArquivo, buffer, {
              contentType: file.mimetype,
              upsert: false,
            })

        if (error) {
          throw error
        }

        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path)
        }

        arquivos.push({
          nome: file.originalname,
          caminho: caminhoArquivo,
          url: caminhoArquivo,
        })
      }

      res.json(arquivos)
    } catch (error) {
      console.error("ERRO NO UPLOAD DE CLIENTE:", error)

      res.status(500).json({
        message: "Erro ao fazer upload de arquivo do cliente",
      })
    }
  }
)

router.post("/", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode cadastrar clientes",
      })
    }

    const senhaGovBr = String(req.body.senhaGovBr || "").trim()
    const novoCliente = await sequelize.transaction(async (transaction) => {
      const cliente = await Cliente.create(limparDadosCliente(req.body), { transaction })
      await salvarSenhaGovBr({ cliente, senha: senhaGovBr, req, transaction })
      return cliente
    })

    res.status(201).json(clienteSemSenha(novoCliente, Boolean(senhaGovBr)))
  } catch (error) {
    console.error("ERRO AO CRIAR CLIENTE:", error)

    res.status(error.status || 500).json({
      message: error.status ? error.message : "Erro ao criar cliente",
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode editar cadastro",
      })
    }

    const { id } = req.params
    const cliente = await Cliente.findByPk(id)

    if (!cliente) {
      return res.status(404).json({
        message: "Cliente não encontrado",
      })
    }

    const senhaGovBr = String(req.body.senhaGovBr || "").trim()
    await sequelize.transaction(async (transaction) => {
      await cliente.update(limparDadosCliente(req.body), { transaction })
      await salvarSenhaGovBr({ cliente, senha: senhaGovBr, req, transaction })
    })

    const clienteAtualizado = await Cliente.findByPk(id)
    const possuiSenha = Boolean(senhaGovBr) || Boolean(await Credencial.findOne({
      where: { clienteId: cliente.id, metodo: "GOV_BR", ativo: true },
      attributes: ["id"],
    }))

    res.json(clienteSemSenha(clienteAtualizado, possuiSenha))
  } catch (error) {
    console.error("ERRO AO ATUALIZAR CLIENTE:", error)

    res.status(error.status || 500).json({
      message: error.status ? error.message : "Erro ao atualizar cliente",
    })
  }
})

router.patch("/:id/acesso-portal", autenticar, async (req, res) => {
  const transaction = await sequelize.transaction()
  try {
    if (req.usuario.perfil !== "Administrador") {
      await transaction.rollback()
      return res.status(403).json({ message: "Somente o administrador pode alterar o acesso ao Portal." })
    }

    const cliente = await Cliente.findByPk(req.params.id, { transaction })
    if (!cliente) {
      await transaction.rollback()
      return res.status(404).json({ message: "Cliente não encontrado" })
    }

    const bloqueado = req.body.bloqueado === true
    const motivo = bloqueado
      ? String(req.body.motivo || "Inadimplência").trim().slice(0, 180)
      : null

    await cliente.update({
      portalBloqueado: bloqueado,
      portalBloqueioMotivo: motivo,
      portalBloqueadoEm: bloqueado ? new Date() : null,
      portalBloqueadoPor: bloqueado ? req.usuario.id : null,
    }, { transaction })

    const whereUsuario = {
      perfil: "Cliente",
      clienteVinculado: cliente.nome,
    }
    if (cliente.escritorioId) whereUsuario.escritorioId = cliente.escritorioId

    if (bloqueado) {
      await Usuario.update(
        { ativo: false, bloqueadoPeloCliente: true },
        { where: { ...whereUsuario, ativo: true }, transaction },
      )
    } else {
      await Usuario.update(
        { ativo: true, bloqueadoPeloCliente: false },
        { where: { ...whereUsuario, bloqueadoPeloCliente: true }, transaction },
      )
    }

    await transaction.commit()
    return res.json({
      cliente: await Cliente.findByPk(cliente.id),
      message: bloqueado
        ? "Acesso do cliente ao Portal bloqueado com sucesso"
        : "Acesso do cliente ao Portal desbloqueado com sucesso",
    })
  } catch (error) {
    if (!transaction.finished) await transaction.rollback()
    console.error("ERRO AO ALTERAR ACESSO DO CLIENTE AO PORTAL:", error)
    return res.status(500).json({ message: "Erro ao alterar acesso ao Portal" })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    if (req.usuario.perfil === "Cliente") {
      return res.status(403).json({
        message: "Cliente não pode excluir cadastro",
      })
    }

    const { id } = req.params
    const cliente = await Cliente.findByPk(id)

    if (!cliente) {
      return res.status(404).json({
        message: "Cliente não encontrado",
      })
    }

    await cliente.destroy()

    res.json({
      message: "Cliente excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR CLIENTE:", error)

    res.status(500).json({
      message: "Erro ao excluir cliente",
    })
  }
})

module.exports = router

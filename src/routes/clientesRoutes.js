const express = require("express")
const fs = require("fs")
const Cliente = require("../models/Cliente")
const upload = require("../middlewares/upload")
const supabase = require("../config/supabase")

const {
  autenticar,
} = require("../middlewares/authMiddleware")

const router = express.Router()

function limparDadosCliente(body) {
  return {
    ...body,
    dataNascimento: body.dataNascimento || null,
    email: body.email || null,
    cnpj: body.cnpj || null,
    regime: body.regime || null,
    cep: body.cep || null,
    endereco: body.endereco || null,
    numero: body.numero || null,
    bairro: body.bairro || null,
    complemento: body.complemento || null,
    cidade: body.cidade || null,
    estado: body.estado || null,
    tituloEleitor: body.tituloEleitor || null,
    codigoSimplesNacional: body.codigoSimplesNacional || null,
    senhaGovBr: body.senhaGovBr || null,
    cnaePrincipal: body.cnaePrincipal || null,
    inscricaoMunicipal: body.inscricaoMunicipal || null,
    inscricaoEstadual: body.inscricaoEstadual || null,
    alvara: body.alvara || null,
    observacao: body.observacao || null,
    anexos: body.anexos || [],
  }
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

    res.json(clientes)
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

    const novoCliente = await Cliente.create(limparDadosCliente(req.body))

    res.status(201).json(novoCliente)
  } catch (error) {
    console.error("ERRO AO CRIAR CLIENTE:", error)

    res.status(500).json({
      message: "Erro ao criar cliente",
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

    await cliente.update(limparDadosCliente(req.body))

const clienteAtualizado = await Cliente.findByPk(id)

res.json(clienteAtualizado)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR CLIENTE:", error)

    res.status(500).json({
      message: "Erro ao atualizar cliente",
    })
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
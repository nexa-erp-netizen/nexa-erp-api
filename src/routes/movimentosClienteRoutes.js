const express = require("express")
const fs = require("fs")
const upload = require("../middlewares/upload")
const MovimentoCliente = require("../models/MovimentoCliente")
const supabase = require("../config/supabaseClient")

const router = express.Router()

const { autenticar } = require("../middlewares/authMiddleware")

function valorParaNumero(valor) {
  if (typeof valor === "number") return valor

  return Number(
    String(valor || 0)
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  )
}

router.get("/", autenticar, async (req, res) => {
  try {
    const where = {}

    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) {
        return res.json([])
      }

      where.cliente = req.usuario.clienteVinculado
    }

    if (req.query.cliente && req.usuario.perfil !== "Cliente") {
      where.cliente = req.query.cliente
    }

    const movimentos = await MovimentoCliente.findAll({
      where,
      order: [["data", "DESC"], ["createdAt", "DESC"]],
    })

    res.json(movimentos)
  } catch (error) {
    console.error("ERRO AO LISTAR MOVIMENTOS:", error)

    res.status(500).json({
      message: "Erro ao listar movimentos",
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  try {
    let clienteFinal = req.body.cliente

    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) {
        return res.status(403).json({
          message: "Cliente não vinculado ao usuário",
        })
      }

      clienteFinal = req.usuario.clienteVinculado
    }

    const movimento = await MovimentoCliente.create({
      ...req.body,
      cliente: clienteFinal,
      valor: valorParaNumero(req.body.valor),
      status: req.body.status || "Pendente",
    })

    res.status(201).json(movimento)
  } catch (error) {
    console.error("ERRO AO CRIAR MOVIMENTO:", error)

    res.status(500).json({
      message: "Erro ao criar movimento",
    })
  }
})

router.post("/massa", autenticar, async (req, res) => {
  try {
    const lista = req.body.movimentos || []

    if (!Array.isArray(lista) || lista.length === 0) {
      return res.status(400).json({
        message: "Nenhum movimento enviado",
      })
    }

    const movimentosTratados = lista.map((item) => {
      let clienteFinal = item.cliente

      if (req.usuario.perfil === "Cliente") {
        clienteFinal = req.usuario.clienteVinculado
      }

      return {
        ...item,
        cliente: clienteFinal,
        valor: valorParaNumero(item.valor),
        status: item.status || "Pendente",
      }
    })

    const movimentos = await MovimentoCliente.bulkCreate(movimentosTratados)

    res.status(201).json(movimentos)
  } catch (error) {
    console.error("ERRO AO CRIAR MOVIMENTOS EM MASSA:", error)

    res.status(500).json({
      message: "Erro ao criar movimentos em massa",
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const movimento = await MovimentoCliente.findByPk(id)

    if (!movimento) {
      return res.status(404).json({
        message: "Movimento não encontrado",
      })
    }

    if (
      req.usuario.perfil === "Cliente" &&
      movimento.cliente !== req.usuario.clienteVinculado
    ) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    await movimento.update({
      ...req.body,
      valor:
        req.body.valor !== undefined
          ? valorParaNumero(req.body.valor)
          : movimento.valor,
    })

    res.json(movimento)
  } catch (error) {
    console.error("ERRO AO ATUALIZAR MOVIMENTO:", error)

    res.status(500).json({
      message: "Erro ao atualizar movimento",
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  try {
    const { id } = req.params

    const movimento = await MovimentoCliente.findByPk(id)

    if (!movimento) {
      return res.status(404).json({
        message: "Movimento não encontrado",
      })
    }

    if (
      req.usuario.perfil === "Cliente" &&
      movimento.cliente !== req.usuario.clienteVinculado
    ) {
      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    await movimento.destroy()

    res.json({
      message: "Movimento excluído com sucesso",
    })
  } catch (error) {
    console.error("ERRO AO EXCLUIR MOVIMENTO:", error)

    res.status(500).json({
      message: "Erro ao excluir movimento",
    })
  }
})

router.post(
  "/upload",
  autenticar,
  upload.single("arquivo"),
  async (req, res) => {
    try {
      const file = req.file

      if (!file) {
        return res.status(400).json({
          message: "Nenhum arquivo enviado",
        })
      }

      const fileBuffer = fs.readFileSync(file.path)

      const nomeArquivo = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`
      const caminhoSupabase = `movimentos/${nomeArquivo}`

      const { error } = await supabase.storage
        .from("nexa-anexos")
        .upload(caminhoSupabase, fileBuffer, {
          contentType: file.mimetype,
          upsert: false,
        })

      if (error) {
        console.error("ERRO SUPABASE:", error)

        return res.status(500).json({
          message: "Erro ao enviar comprovante para o Supabase",
        })
      }

      const { data } = supabase.storage
        .from("nexa-anexos")
        .getPublicUrl(caminhoSupabase)

      fs.unlinkSync(file.path)

      res.json({
        nome: file.originalname,
        caminho: data.publicUrl,
      })
    } catch (error) {
      console.error("ERRO NO UPLOAD DO MOVIMENTO:", error)

      res.status(500).json({
        message: "Erro ao fazer upload do comprovante",
      })
    }
  }
)

module.exports = router
const express = require("express")
const crypto = require("crypto")
const fs = require("fs")
const upload = require("../middlewares/upload")
const MovimentoCliente = require("../models/MovimentoCliente")
const LancamentoContabil = require("../models/LancamentoContabil")
const Cliente = require("../models/Cliente")
const supabase = require("../config/supabaseClient")
const { normalizarDataMovimento, competenciaDaData } = require("../services/dataMovimentoService")
const {
  resolverClienteFinanceiro,
  resolverClienteDoUsuario,
  registroPertenceAoCliente,
  vincularClienteIdSeNecessario,
  clienteIdValido,
} = require("../services/clienteFinanceiroService")
const {
  limparIdempotenciasExpiradas,
  buscarIdempotenciaAtiva,
  iniciarIdempotencia,
  concluirIdempotencia,
  ehConflitoDeIdempotencia,
  respostaPersistida,
} = require("../services/idempotenciaService")

const router = express.Router()

const { autenticar } = require("../middlewares/authMiddleware")

// Proteção de reenvio persistida no PostgreSQL.
// Continua funcionando após reinício do Render e entre múltiplas instâncias da API.
const JANELA_CHAVE_EXPLICITA_MS = 24 * 60 * 60 * 1000
const JANELA_LOTE_MS = 2 * 60 * 1000
const JANELA_ITEM_UNICO_MS = 8 * 1000

function normalizarNomeCliente(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function normalizarTextoAssinatura(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function valorParaNumero(valor) {
  if (typeof valor === "number") return valor

  if (valor === null || valor === undefined || valor === "") {
    return 0
  }

  let texto = String(valor)
    .replace("R$", "")
    .trim()

  const temVirgula = texto.includes(",")
  const temPonto = texto.includes(".")

  if (temVirgula) {
    texto = texto.replace(/\./g, "").replace(",", ".")
  } else if (temPonto) {
    texto = texto
  }

  const numero = Number(texto)

  return Number.isFinite(numero) ? numero : 0
}

function obterCompetencia(data) {
  return competenciaDaData(data) || "00/0000"
}

function validarDataNova(valor) {
  const resultado = normalizarDataMovimento(valor)
  return resultado.valida && !resultado.corrigida ? resultado.data : null
}

function descricaoLancamento(movimento) {
  return movimento.descricao || "Movimento do cliente"
}

function origemDoUsuario(usuario) {
  return usuario?.perfil === "Cliente" ? "Cliente" : "Escritório"
}

function assinaturaMovimento(item) {
  return [
    clienteIdValido(item.clienteId) || normalizarTextoAssinatura(item.cliente),
    String(item.data || ""),
    normalizarTextoAssinatura(item.tipo),
    String(item.planoContaId || ""),
    normalizarTextoAssinatura(item.planoContaNome || item.planoConta),
    normalizarTextoAssinatura(item.descricao),
    valorParaNumero(item.valor).toFixed(2),
    normalizarTextoAssinatura(item.formaPagamento || item.forma),
  ].join("|")
}

function obterProtecaoReenvio(lista, req) {
  const chaveExplicita = String(
    req.body?.chaveIdempotencia ||
    req.headers["x-idempotency-key"] ||
    ""
  ).trim()

  const escritorio = String(
    req.usuario?.escritorioId ||
    req.escritorioId ||
    "sem-escritorio"
  )

  const usuario = String(
    req.usuario?.id ||
    req.usuario?.email ||
    req.usuario?.clienteVinculado ||
    "sem-usuario"
  )

  const escopo = `${escritorio}:${usuario}`

  if (chaveExplicita) {
    return {
      chave: `explicit:${escopo}:${chaveExplicita}`,
      ttl: JANELA_CHAVE_EXPLICITA_MS,
      tipo: lista.length === 1 ? "movimento-unico-explicito" : "movimento-lote-explicito",
    }
  }

  const conteudo = lista.map(assinaturaMovimento).sort().join("\n")
  const hash = crypto.createHash("sha256").update(conteudo).digest("hex")

  return {
    chave: `auto:${escopo}:${hash}`,
    // Um único lançamento pode ser legitimamente repetido.
    // Por isso a proteção heurística nele dura só alguns segundos.
    ttl: lista.length === 1 ? JANELA_ITEM_UNICO_MS : JANELA_LOTE_MS,
    tipo: lista.length === 1 ? "movimento-unico-auto" : "movimento-lote-auto",
  }
}

function respostaPlana(resposta) {
  return {
    movimentos: (resposta.movimentos || []).map(item =>
      typeof item?.toJSON === "function" ? item.toJSON() : item
    ),
    lancamentosContabeis: (resposta.lancamentosContabeis || []).map(item =>
      typeof item?.toJSON === "function" ? item.toJSON() : item
    ),
    duplicadoEvitado: false,
  }
}

function chavePossivelDuplicado(item) {
  return assinaturaMovimento(item)
}

function movimentoParaRespostaDuplicado(item) {
  if (!item) return null
  return typeof item.toJSON === "function" ? item.toJSON() : item
}

async function criarLancamentoContabilDoMovimento(
  movimento,
  usuario,
  transaction = null
) {
  const referencia = `movimento-cliente:${movimento.id}`

  let existente = await LancamentoContabil.findOne({
    where: {
      movimentoClienteId: movimento.id,
    },
    transaction,
  })

  if (!existente) {
    existente = await LancamentoContabil.findOne({
      where: {
        cliente: movimento.cliente,
        observacao: referencia,
      },
      transaction,
    })
  }

  const dadosLancamento = {
    clienteId: movimento.clienteId || null,
    data: movimento.data,
    competencia: obterCompetencia(movimento.data),
    tipo: movimento.tipo,
    planoConta: movimento.planoContaNome || "Movimentos Cliente",
    descricao: descricaoLancamento(movimento),
    valor: valorParaNumero(movimento.valor),
    formaPagamento:
      movimento.formaPagamento || movimento.forma || "",
    origem: existente?.origem || origemDoUsuario(usuario),
    movimentoClienteId: movimento.id,
    anexos: movimento.comprovante
      ? [{ nome: "Comprovante", caminho: movimento.comprovante }]
      : [],
    empresaId: usuario?.empresaId || null,
  }

  if (existente) {
    await existente.update(dadosLancamento, { transaction })
    return existente
  }

  return LancamentoContabil.create({
    clienteId: movimento.clienteId || null,
    cliente: movimento.cliente,
    ...dadosLancamento,
    observacao: referencia,
  }, { transaction })
}

async function removerLancamentoContabilDoMovimento(
  movimento,
  transaction = null
) {
  const referencia = `movimento-cliente:${movimento.id}`

  const vinculado = await LancamentoContabil.findOne({
    where: {
      movimentoClienteId: movimento.id,
    },
    transaction,
  })

  if (vinculado) {
    await vinculado.destroy({ transaction })
    return
  }

  await LancamentoContabil.destroy({
    where: {
      cliente: movimento.cliente,
      observacao: referencia,
    },
    transaction,
  })
}

async function corrigirEFiltrarDatasLegadas(movimentos, usuario) {
  const validos = []

  for (const movimento of movimentos) {
    const resultado = normalizarDataMovimento(movimento.data)

    if (!resultado.valida) {
      console.warn(`Movimento ${movimento.id} ignorado por data inválida: ${movimento.data}`)
      continue
    }

    if (resultado.corrigida) {
      await movimento.update({ data: resultado.data })
      await criarLancamentoContabilDoMovimento(movimento, usuario)
      console.warn(`Movimento ${movimento.id} corrigido de ano legado para ${resultado.data}`)
    }

    validos.push(movimento)
  }

  return validos
}

router.get("/", autenticar, async (req, res) => {
  try {
    let clienteFiltro = null

    if (req.usuario.perfil === "Cliente") {
      if (!req.usuario.clienteVinculado) return res.json([])
      clienteFiltro = await resolverClienteDoUsuario(req.usuario)
      if (!clienteFiltro) return res.json([])
    } else if (req.query.clienteId || req.query.cliente) {
      clienteFiltro = await resolverClienteFinanceiro({
        clienteId: req.query.clienteId,
        cliente: req.query.cliente,
      })

      if (!clienteFiltro) {
        return res.status(404).json({ message: "Cliente não encontrado" })
      }
    }

    const movimentos = await MovimentoCliente.findAll({
      order: [["data", "DESC"], ["createdAt", "DESC"]],
    })

    const filtrados = clienteFiltro
      ? movimentos.filter((item) => registroPertenceAoCliente(item, clienteFiltro))
      : movimentos

    if (clienteFiltro) {
      for (const item of filtrados) {
        await vincularClienteIdSeNecessario(item, clienteFiltro)
      }
    }

    res.json(await corrigirEFiltrarDatasLegadas(filtrados, req.usuario))
  } catch (error) {
    console.error("ERRO AO LISTAR MOVIMENTOS:", error)

    res.status(500).json({
      message: "Erro ao listar movimentos",
    })
  }
})

// Verifica se um novo lançamento se parece com algo já salvo.
// Apenas avisa: nunca bloqueia um lançamento legítimo confirmado pelo usuário.
router.post("/duplicados/verificar", autenticar, async (req, res) => {
  try {
    const lista = Array.isArray(req.body.movimentos)
      ? req.body.movimentos
      : []

    if (!lista.length) {
      return res.json({
        duplicados: [],
        quantidade: 0,
      })
    }

    if (
      req.usuario.perfil === "Cliente" &&
      !req.usuario.clienteVinculado
    ) {
      return res.status(403).json({
        message: "Cliente não vinculado ao usuário",
      })
    }

    const clienteDoUsuario = req.usuario.perfil === "Cliente"
      ? await resolverClienteDoUsuario(req.usuario)
      : null

    const tratados = await Promise.all(lista.map(async (item, indice) => {
      const data = validarDataNova(item.data)

      if (!data) {
        return {
          indice,
          invalido: true,
          item,
        }
      }

      const clienteFinanceiro = clienteDoUsuario || await resolverClienteFinanceiro({
        clienteId: item.clienteId,
        cliente: item.cliente,
      })

      return {
        indice,
        invalido: false,
        item: {
          ...item,
          data,
          clienteId: clienteFinanceiro?.id || item.clienteId || null,
          cliente: clienteFinanceiro?.nome || (req.usuario.perfil === "Cliente"
            ? req.usuario.clienteVinculado
            : item.cliente),
          valor: valorParaNumero(item.valor),
        },
      }
    }))

    const invalido = tratados.find(item => item.invalido)

    if (invalido) {
      return res.status(400).json({
        message:
          `Data inválida na linha ${invalido.indice + 1}. ` +
          "Corrija antes de verificar duplicidade.",
      })
    }

    const movimentosExistentes = await MovimentoCliente.findAll({
      order: [["createdAt", "ASC"], ["id", "ASC"]],
    })

    const porAssinatura = new Map()

    for (const existente of movimentosExistentes) {
      const chave = assinaturaMovimento(existente)

      if (!porAssinatura.has(chave)) {
        porAssinatura.set(chave, [])
      }

      porAssinatura.get(chave).push(existente)
    }

    const vistosNoLote = new Map()
    const duplicados = []

    for (const tratado of tratados) {
      const novo = tratado.item
      const chave = assinaturaMovimento(novo)
      const existentes = porAssinatura.get(chave) || []
      const anterioresNoLote = vistosNoLote.get(chave) || []

      if (existentes.length || anterioresNoLote.length) {
        const referencia =
          existentes[0] ||
          anterioresNoLote[0]?.item ||
          null

        duplicados.push({
          indice: tratado.indice,
          novo,
          existente: movimentoParaRespostaDuplicado(referencia),
          quantidadeExistentes: existentes.length,
          repetidoNoMesmoLote: anterioresNoLote.length > 0,
        })
      }

      if (!vistosNoLote.has(chave)) {
        vistosNoLote.set(chave, [])
      }

      vistosNoLote.get(chave).push(tratado)
    }

    res.json({
      duplicados,
      quantidade: duplicados.length,
    })
  } catch (error) {
    console.error("ERRO AO VERIFICAR POSSÍVEL DUPLICIDADE:", error)

    res.status(500).json({
      message: "Erro ao verificar possíveis duplicados",
      erro: error.message,
    })
  }
})

// Localiza possíveis duplicados existentes.
// Não apaga nada: a decisão continua sendo do escritório.
router.get("/duplicados", autenticar, async (req, res) => {
  try {
    const movimentos = await MovimentoCliente.findAll({
      order: [["data", "DESC"], ["createdAt", "ASC"], ["id", "ASC"]],
    })

    let filtrados = movimentos
    let clienteFiltro = null

    if (req.usuario.perfil === "Cliente") {
      clienteFiltro = await resolverClienteDoUsuario(req.usuario)
    } else if (req.query.clienteId || req.query.cliente) {
      clienteFiltro = await resolverClienteFinanceiro({
        clienteId: req.query.clienteId,
        cliente: req.query.cliente,
      })
    }

    if (clienteFiltro) {
      filtrados = filtrados.filter((item) => registroPertenceAoCliente(item, clienteFiltro))
      for (const item of filtrados) {
        await vincularClienteIdSeNecessario(item, clienteFiltro)
      }
    }

    if (req.query.competencia) {
      const competencia = String(req.query.competencia)

      filtrados = filtrados.filter(
        item => obterCompetencia(item.data) === competencia
      )
    }

    const grupos = new Map()

    for (const movimento of filtrados) {
      const chave = chavePossivelDuplicado(movimento)

      if (!grupos.has(chave)) grupos.set(chave, [])
      grupos.get(chave).push(movimento)
    }

    const suspeitos = [...grupos.values()]
      .filter(grupo => grupo.length > 1)
      .map(grupo => {
        const ordenados = [...grupo].sort(
          (a, b) =>
            new Date(a.createdAt || 0) - new Date(b.createdAt || 0) ||
            Number(a.id) - Number(b.id)
        )

        const primeiro = ordenados[0]
        const ultimo = ordenados[ordenados.length - 1]

        const primeiroEm = new Date(primeiro.createdAt || 0).getTime()
        const ultimoEm = new Date(ultimo.createdAt || 0).getTime()
        const intervaloSegundos =
          Number.isFinite(primeiroEm) && Number.isFinite(ultimoEm)
            ? Math.max(0, Math.round((ultimoEm - primeiroEm) / 1000))
            : null

        return {
          quantidade: ordenados.length,
          confianca:
            intervaloSegundos !== null && intervaloSegundos <= 120
              ? "Alta"
              : "Revisar",
          intervaloSegundos,
          manterSugeridoId: ordenados[0].id,
          excluirSugeridosIds: ordenados.slice(1).map(item => item.id),
          valorUnitario: valorParaNumero(ordenados[0].valor),
          valorPossivelmenteDuplicado:
            valorParaNumero(ordenados[0].valor) * (ordenados.length - 1),
          cliente: ordenados[0].cliente,
          data: ordenados[0].data,
          tipo: ordenados[0].tipo,
          planoContaId: ordenados[0].planoContaId || null,
          planoContaNome: ordenados[0].planoContaNome || "",
          descricao: ordenados[0].descricao || "",
          formaPagamento:
            ordenados[0].formaPagamento ||
            ordenados[0].forma ||
            "",
          movimentos: ordenados,
        }
      })
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))

    res.json({
      grupos: suspeitos,
      quantidadeGrupos: suspeitos.length,
      quantidadeRegistrosSuspeitos: suspeitos.reduce(
        (total, grupo) => total + grupo.quantidade,
        0
      ),
      valorPossivelmenteDuplicado: suspeitos.reduce(
        (total, grupo) => total + Number(grupo.valorPossivelmenteDuplicado || 0),
        0
      ),
      observacao:
        "São apenas possíveis duplicados. Compras legítimas podem ter a mesma data, descrição e valor. Nenhum registro foi excluído automaticamente.",
    })
  } catch (error) {
    console.error("ERRO AO LOCALIZAR DUPLICADOS:", error)

    res.status(500).json({
      message: "Erro ao localizar possíveis duplicados",
      erro: error.message,
    })
  }
})

// Exclui somente movimentos que o escritório confirmou como duplicados.
router.post("/duplicados/remover", autenticar, async (req, res) => {
  if (req.usuario.perfil === "Cliente") {
    return res.status(403).json({
      message: "Somente o escritório pode remover duplicados em lote.",
    })
  }

  if (req.body.confirmar !== true) {
    return res.status(400).json({
      message: "Confirme explicitamente a remoção dos duplicados.",
    })
  }

  const manterId = Number(req.body.manterId)

  if (!Number.isInteger(manterId)) {
    return res.status(400).json({
      message: "Informe o lançamento que deve ser mantido.",
    })
  }

  const ids = [...new Set(
    (Array.isArray(req.body.idsExcluir) ? req.body.idsExcluir : [])
      .map(Number)
      .filter(Number.isInteger)
  )].filter(id => id !== manterId)

  if (!ids.length) {
    return res.status(400).json({
      message: "Informe os IDs confirmados para exclusão.",
    })
  }

  const transaction = await MovimentoCliente.sequelize.transaction()

  try {
    const manter = await MovimentoCliente.findByPk(manterId, { transaction })

    if (!manter) {
      await transaction.rollback()

      return res.status(404).json({
        message: "O lançamento escolhido para manter não foi encontrado.",
      })
    }

    const assinaturaManter = assinaturaMovimento(manter)
    const removidos = []

    for (const id of ids) {
      const movimento = await MovimentoCliente.findByPk(id, { transaction })

      if (!movimento) continue

      if (assinaturaMovimento(movimento) !== assinaturaManter) {
        await transaction.rollback()

        return res.status(400).json({
          message:
            "A remoção foi cancelada porque um dos registros não é igual ao lançamento mantido.",
        })
      }

      await removerLancamentoContabilDoMovimento(movimento, transaction)
      await movimento.destroy({ transaction })

      removidos.push(id)
    }

    await transaction.commit()

    res.json({
      message:
        `${removidos.length} duplicado(s) removido(s). ` +
        `O lançamento ${manterId} foi mantido.`,
      manterId,
      removidos,
    })
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }

    console.error("ERRO AO REMOVER DUPLICADOS:", error)

    res.status(500).json({
      message: "Erro ao remover duplicados confirmados",
      erro: error.message,
    })
  }
})

router.post("/", autenticar, async (req, res) => {
  const dataValida = validarDataNova(req.body.data)

  if (!dataValida) {
    return res.status(400).json({
      message: "Data inválida. Informe uma data entre 1900 e o próximo ano.",
    })
  }

  let clienteFinanceiro

  if (req.usuario.perfil === "Cliente") {
    if (!req.usuario.clienteVinculado) {
      return res.status(403).json({
        message: "Cliente não vinculado ao usuário",
      })
    }
    clienteFinanceiro = await resolverClienteDoUsuario(req.usuario)
  } else {
    clienteFinanceiro = await resolverClienteFinanceiro({
      clienteId: req.body.clienteId,
      cliente: req.body.cliente,
    })
  }

  if (!clienteFinanceiro) {
    return res.status(400).json({
      message: "Selecione um cliente cadastrado antes de salvar o movimento.",
    })
  }

  const movimentoTratado = {
    ...req.body,
    data: dataValida,
    clienteId: clienteFinanceiro.id,
    cliente: clienteFinanceiro.nome,
    valor: valorParaNumero(req.body.valor),
    status: req.body.status || "Pendente",
  }

  const protecao = obterProtecaoReenvio([movimentoTratado], req)
  const { chave, ttl, tipo } = protecao

  await limparIdempotenciasExpiradas()

  const anterior = await buscarIdempotenciaAtiva(chave)
  const respostaAnterior = respostaPersistida(anterior)

  if (respostaAnterior) {
    return res.status(200).json({
      ...respostaAnterior,
      duplicadoEvitado: true,
      message:
        "Este mesmo lançamento já havia sido recebido. Nenhum registro foi duplicado.",
    })
  }

  const transaction = await MovimentoCliente.sequelize.transaction()

  try {
    const idempotencia = await iniciarIdempotencia({
      chave,
      tipo,
      ttlMs: ttl,
      transaction,
    })

    const movimento = await MovimentoCliente.create(
      movimentoTratado,
      { transaction }
    )

    const lancamentoContabil = await criarLancamentoContabilDoMovimento(
      movimento,
      req.usuario,
      transaction
    )

    const resposta = {
      movimento:
        typeof movimento?.toJSON === "function"
          ? movimento.toJSON()
          : movimento,
      lancamentoContabil:
        typeof lancamentoContabil?.toJSON === "function"
          ? lancamentoContabil.toJSON()
          : lancamentoContabil,
      duplicadoEvitado: false,
    }

    await concluirIdempotencia(
      idempotencia,
      resposta,
      transaction
    )

    await transaction.commit()

    res.status(201).json(resposta)
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }

    if (ehConflitoDeIdempotencia(error)) {
      const persistida = await buscarIdempotenciaAtiva(chave)
      const resposta = respostaPersistida(persistida)

      if (resposta) {
        return res.status(200).json({
          ...resposta,
          duplicadoEvitado: true,
          message:
            "Este mesmo lançamento já havia sido recebido. Nenhum registro foi duplicado.",
        })
      }

      return res.status(409).json({
        message:
          "Este lançamento já está sendo processado. Aguarde a conclusão antes de tentar novamente.",
        duplicadoEvitado: true,
      })
    }

    console.error("ERRO AO CRIAR MOVIMENTO:", error)

    res.status(500).json({
      message:
        "Erro ao criar movimento. A gravação foi desfeita para evitar duplicidade.",
      erro: error.message,
    })
  }
})

router.post("/massa", autenticar, async (req, res) => {
  const lista = req.body.movimentos || []

  if (!Array.isArray(lista) || lista.length === 0) {
    return res.status(400).json({
      message: "Nenhum movimento enviado",
    })
  }

  if (
    req.usuario.perfil === "Cliente" &&
    !req.usuario.clienteVinculado
  ) {
    return res.status(403).json({
      message: "Cliente não vinculado ao usuário",
    })
  }

  const dataInvalidaIndice = lista.findIndex(
    item => !validarDataNova(item.data)
  )

  if (dataInvalidaIndice >= 0) {
    return res.status(400).json({
      message:
        `Data inválida na linha ${dataInvalidaIndice + 1}. ` +
        "Corrija o ano antes de salvar.",
    })
  }

  const clienteDoUsuario = req.usuario.perfil === "Cliente"
    ? await resolverClienteDoUsuario(req.usuario)
    : null

  const movimentosTratados = []

  for (const item of lista) {
    const clienteFinanceiro = clienteDoUsuario || await resolverClienteFinanceiro({
      clienteId: item.clienteId,
      cliente: item.cliente,
    })

    if (!clienteFinanceiro) {
      return res.status(400).json({
        message: `Cliente não identificado para o movimento: ${item.cliente || "sem nome"}`,
      })
    }

    movimentosTratados.push({
      ...item,
      data: validarDataNova(item.data),
      clienteId: clienteFinanceiro.id,
      cliente: clienteFinanceiro.nome,
      valor: valorParaNumero(item.valor),
      status: item.status || "Pendente",
    })
  }

  const protecao = obterProtecaoReenvio(movimentosTratados, req)
  const { chave, ttl, tipo } = protecao

  await limparIdempotenciasExpiradas()

  const anterior = await buscarIdempotenciaAtiva(chave)
  const respostaAnterior = respostaPersistida(anterior)

  if (respostaAnterior) {
    return res.status(200).json({
      ...respostaAnterior,
      duplicadoEvitado: true,
      message:
        "Este mesmo lote já havia sido recebido. Nenhum lançamento foi duplicado.",
    })
  }

  const transaction = await MovimentoCliente.sequelize.transaction()

  try {
    const idempotencia = await iniciarIdempotencia({
      chave,
      tipo,
      ttlMs: ttl,
      transaction,
    })

    // MovimentoCliente + LancamentoContabil são uma única operação.
    // Se qualquer parte falhar, inclusive a chave idempotente, todo o lote é desfeito.
    const movimentos = await MovimentoCliente.bulkCreate(
      movimentosTratados,
      { transaction }
    )

    const lancamentosContabeis = []

    for (const movimento of movimentos) {
      const lancamento = await criarLancamentoContabilDoMovimento(
        movimento,
        req.usuario,
        transaction
      )

      lancamentosContabeis.push(lancamento)
    }

    const resposta = respostaPlana({
      movimentos,
      lancamentosContabeis,
    })

    await concluirIdempotencia(
      idempotencia,
      resposta,
      transaction
    )

    await transaction.commit()

    res.status(201).json(resposta)
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }

    if (ehConflitoDeIdempotencia(error)) {
      const persistida = await buscarIdempotenciaAtiva(chave)
      const resposta = respostaPersistida(persistida)

      if (resposta) {
        return res.status(200).json({
          ...resposta,
          duplicadoEvitado: true,
          message:
            "Este mesmo lote já havia sido recebido. Nenhum lançamento foi duplicado.",
        })
      }

      return res.status(409).json({
        message:
          "Este lote já está sendo processado. Aguarde a conclusão antes de tentar novamente.",
        duplicadoEvitado: true,
      })
    }

    console.error("ERRO AO CRIAR MOVIMENTOS EM MASSA:", error)

    res.status(500).json({
      message:
        "Erro ao criar movimentos em massa. Nenhum item deste lote foi gravado.",
      erro: error.message,
    })
  }
})

router.put("/:id", autenticar, async (req, res) => {
  const transaction = await MovimentoCliente.sequelize.transaction()

  try {
    const { id } = req.params

    const movimento = await MovimentoCliente.findByPk(
      id,
      { transaction }
    )

    if (!movimento) {
      await transaction.rollback()

      return res.status(404).json({
        message: "Movimento não encontrado",
      })
    }

    const clienteDoUsuario = req.usuario.perfil === "Cliente"
      ? await resolverClienteDoUsuario(req.usuario, transaction)
      : null

    if (
      req.usuario.perfil === "Cliente" &&
      (!clienteDoUsuario || !registroPertenceAoCliente(movimento, clienteDoUsuario))
    ) {
      await transaction.rollback()

      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    if (String(movimento.observacao || "").includes("ajuste-conciliacao-bancaria:")) {
      await transaction.rollback()
      return res.status(409).json({
        message: "Este movimento foi gerado por um ajuste da Conciliação Bancária. Edite ou desfaça o ajuste pela própria conciliação.",
      })
    }

    const dataInformada = req.body.data !== undefined
      ? validarDataNova(req.body.data)
      : normalizarDataMovimento(movimento.data).data

    if (!dataInformada) {
      await transaction.rollback()

      return res.status(400).json({
        message: "Data inválida. Corrija o ano antes de salvar.",
      })
    }

    const clienteFinanceiro = clienteDoUsuario || await resolverClienteFinanceiro({
      clienteId: req.body.clienteId || movimento.clienteId,
      cliente: req.body.cliente || movimento.cliente,
      transaction,
    })

    if (!clienteFinanceiro) {
      await transaction.rollback()
      return res.status(400).json({
        message: "Não foi possível identificar o cliente cadastrado deste movimento.",
      })
    }

    await movimento.update({
      ...req.body,
      clienteId: clienteFinanceiro.id,
      cliente: clienteFinanceiro.nome,
      data: dataInformada,
      valor:
        req.body.valor !== undefined
          ? valorParaNumero(req.body.valor)
          : movimento.valor,
    }, { transaction })

    const lancamentoContabil = await criarLancamentoContabilDoMovimento(
      movimento,
      req.usuario,
      transaction
    )

    await transaction.commit()

    res.json({
      movimento,
      lancamentoContabil,
    })
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }

    console.error("ERRO AO ATUALIZAR MOVIMENTO:", error)

    res.status(500).json({
      message:
        "Erro ao atualizar movimento. Nenhuma alteração parcial foi mantida.",
      erro: error.message,
    })
  }
})

router.delete("/:id", autenticar, async (req, res) => {
  const transaction = await MovimentoCliente.sequelize.transaction()

  try {
    const { id } = req.params

    const movimento = await MovimentoCliente.findByPk(id, { transaction })

    if (!movimento) {
      await transaction.rollback()

      return res.status(404).json({
        message: "Movimento não encontrado",
      })
    }

    const clienteDoUsuario = req.usuario.perfil === "Cliente"
      ? await resolverClienteDoUsuario(req.usuario, transaction)
      : null

    if (
      req.usuario.perfil === "Cliente" &&
      (!clienteDoUsuario || !registroPertenceAoCliente(movimento, clienteDoUsuario))
    ) {
      await transaction.rollback()

      return res.status(403).json({
        message: "Acesso não autorizado",
      })
    }

    if (String(movimento.observacao || "").includes("ajuste-conciliacao-bancaria:")) {
      await transaction.rollback()
      return res.status(409).json({
        message: "Este movimento foi gerado por um ajuste da Conciliação Bancária. Desfaça o ajuste pela própria conciliação.",
      })
    }

    await removerLancamentoContabilDoMovimento(movimento, transaction)
    await movimento.destroy({ transaction })

    await transaction.commit()

    res.json({
      message: "Movimento excluído com sucesso",
    })
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback()
    }

    console.error("ERRO AO EXCLUIR MOVIMENTO:", error)

    res.status(500).json({
      message: "Erro ao excluir movimento",
      erro: error.message,
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

      const nomeArquivo =
        `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`
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

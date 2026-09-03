const Cliente = require("../models/Cliente")

function normalizarNomeCliente(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function clienteIdValido(valor) {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero > 0 ? numero : null
}

async function resolverClienteFinanceiro({ clienteId = null, cliente = null, transaction = null } = {}) {
  const id = clienteIdValido(clienteId)

  if (id) {
    const encontrado = await Cliente.findByPk(id, { transaction })
    if (encontrado) return encontrado
  }

  const nomeNormalizado = normalizarNomeCliente(cliente)
  if (!nomeNormalizado) return null

  // Busca todos do escritório atual e compara o nome de forma tolerante.
  // O filtro multiempresa do Sequelize continua sendo aplicado normalmente.
  const candidatos = await Cliente.findAll({ transaction })
  const equivalentes = candidatos.filter(
    (item) => normalizarNomeCliente(item.nome) === nomeNormalizado
  )

  return equivalentes.length === 1 ? equivalentes[0] : null
}

async function resolverClienteDoUsuario(usuario, transaction = null) {
  if (!usuario || usuario.perfil !== "Cliente" || !usuario.clienteVinculado) {
    return null
  }

  return resolverClienteFinanceiro({
    cliente: usuario.clienteVinculado,
    transaction,
  })
}

function registroPertenceAoCliente(registro, cliente) {
  if (!registro || !cliente) return false

  const registroId = clienteIdValido(registro.clienteId)
  const clienteId = clienteIdValido(cliente.id)

  if (registroId && clienteId) {
    return registroId === clienteId
  }

  return normalizarNomeCliente(registro.cliente) === normalizarNomeCliente(cliente.nome)
}

async function vincularClienteIdSeNecessario(registro, cliente, transaction = null) {
  if (!registro || !cliente?.id) return registro

  const atual = clienteIdValido(registro.clienteId)
  if (atual === Number(cliente.id)) return registro
  if (atual && atual !== Number(cliente.id)) return registro

  await registro.update({ clienteId: Number(cliente.id) }, { transaction })
  return registro
}

async function backfillIdentidadeFinanceira({ MovimentoCliente, LancamentoContabil } = {}) {
  const modelos = [
    [MovimentoCliente, "MovimentoCliente"],
    [LancamentoContabil, "LancamentoContabil"],
  ].filter(([modelo]) => modelo)

  const clientes = await Cliente.findAll({ semIsolamentoEscritorio: true })
  const mapa = new Map()

  for (const cliente of clientes) {
    const chave = `${Number(cliente.escritorioId || 0)}|${normalizarNomeCliente(cliente.nome)}`
    if (!chave.endsWith("|")) {
      const lista = mapa.get(chave) || []
      lista.push(cliente)
      mapa.set(chave, lista)
    }
  }

  let atualizados = 0
  let ambiguos = 0

  for (const [Modelo, rotulo] of modelos) {
    const registros = await Modelo.findAll({ semIsolamentoEscritorio: true })

    for (const registro of registros) {
      if (clienteIdValido(registro.clienteId)) continue

      const chave = `${Number(registro.escritorioId || 0)}|${normalizarNomeCliente(registro.cliente)}`
      const candidatos = mapa.get(chave) || []

      if (candidatos.length === 1) {
        await registro.update(
          { clienteId: Number(candidatos[0].id) },
          { semIsolamentoEscritorio: true }
        )
        atualizados += 1
      } else if (candidatos.length > 1) {
        ambiguos += 1
        console.warn(`[Identidade Financeira] ${rotulo} #${registro.id} não vinculado: nome ambíguo.`)
      }
    }
  }

  return { atualizados, ambiguos }
}

module.exports = {
  normalizarNomeCliente,
  clienteIdValido,
  resolverClienteFinanceiro,
  resolverClienteDoUsuario,
  registroPertenceAoCliente,
  vincularClienteIdSeNecessario,
  backfillIdentidadeFinanceira,
}

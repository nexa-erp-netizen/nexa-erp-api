const { Op } = require("sequelize")
const Cliente = require("../models/Cliente")
const UsuarioCliente = require("../models/UsuarioCliente")

function numeroId(valor) {
  const id = Number(valor)
  return Number.isInteger(id) && id > 0 ? id : null
}

function idsUnicos(valores = []) {
  return [...new Set((Array.isArray(valores) ? valores : [valores]).map(numeroId).filter(Boolean))]
}

function clientePublico(cliente, vinculo = null) {
  if (!cliente) return null
  return {
    id: cliente.id,
    nome: cliente.nome,
    cpf: cliente.cpf,
    cnpj: cliente.cnpj,
    situacaoEmpresa: cliente.situacaoEmpresa || "Ativa",
    portalBloqueado: cliente.portalBloqueado === true,
    ativo: cliente.ativo !== false,
    principal: vinculo?.principal === true,
  }
}

async function clientesVinculadosAoUsuario(usuario, { incluirInativos = false, transaction = null } = {}) {
  if (!usuario?.id) return []

  const whereVinculo = { usuarioId: usuario.id }
  if (!incluirInativos) whereVinculo.ativo = true
  if (usuario.escritorioId) whereVinculo.escritorioId = usuario.escritorioId

  const vinculos = await UsuarioCliente.findAll({
    where: whereVinculo,
    order: [["principal", "DESC"], ["createdAt", "ASC"]],
    transaction,
    semIsolamentoEscritorio: true,
  })

  if (vinculos.length) {
    const clientes = await Cliente.findAll({
      where: {
        id: { [Op.in]: vinculos.map(item => item.clienteId) },
        ...(usuario.escritorioId ? { escritorioId: usuario.escritorioId } : {}),
      },
      transaction,
      semIsolamentoEscritorio: true,
    })
    const porId = new Map(clientes.map(cliente => [Number(cliente.id), cliente]))
    return vinculos
      .map(vinculo => clientePublico(porId.get(Number(vinculo.clienteId)), vinculo))
      .filter(Boolean)
  }

  if (!usuario.clienteVinculado) return []

  const clienteLegado = await Cliente.findOne({
    where: {
      nome: usuario.clienteVinculado,
      ...(usuario.escritorioId ? { escritorioId: usuario.escritorioId } : {}),
    },
    transaction,
    semIsolamentoEscritorio: true,
  })

  return clienteLegado ? [clientePublico(clienteLegado, { principal: true })] : []
}

function escolherClienteAtivo(clientes, clienteIdPreferido = null) {
  const idPreferido = numeroId(clienteIdPreferido)
  const permitido = idPreferido
    ? clientes.find(cliente => Number(cliente.id) === idPreferido)
    : null
  if (permitido) return permitido

  return clientes.find(cliente => cliente.principal && !cliente.portalBloqueado)
    || clientes.find(cliente => !cliente.portalBloqueado)
    || clientes.find(cliente => cliente.principal)
    || clientes[0]
    || null
}

async function substituirClientesDoUsuario(usuario, clienteIds, clientePrincipalId = null, transaction = null) {
  const ids = idsUnicos(clienteIds)
  if (!usuario?.id) throw new Error("Usuário inválido para vincular empresas")
  if (!ids.length) throw new Error("Selecione ao menos uma empresa para o usuário cliente")

  const clientes = await Cliente.findAll({
    where: {
      id: { [Op.in]: ids },
      ...(usuario.escritorioId ? { escritorioId: usuario.escritorioId } : {}),
    },
    transaction,
    semIsolamentoEscritorio: true,
  })

  if (clientes.length !== ids.length) {
    throw new Error("Uma ou mais empresas selecionadas não pertencem a este escritório")
  }

  const principalId = ids.includes(numeroId(clientePrincipalId))
    ? numeroId(clientePrincipalId)
    : ids[0]

  await UsuarioCliente.update(
    { ativo: false, principal: false },
    {
      where: {
        usuarioId: usuario.id,
        ...(usuario.escritorioId ? { escritorioId: usuario.escritorioId } : {}),
      },
      transaction,
      semIsolamentoEscritorio: true,
    },
  )

  for (const cliente of clientes) {
    const [vinculo] = await UsuarioCliente.findOrCreate({
      where: {
        usuarioId: usuario.id,
        clienteId: cliente.id,
        escritorioId: usuario.escritorioId || cliente.escritorioId || null,
      },
      defaults: {
        ativo: true,
        principal: Number(cliente.id) === principalId,
      },
      transaction,
      semIsolamentoEscritorio: true,
    })
    await vinculo.update({
      ativo: true,
      principal: Number(cliente.id) === principalId,
    }, { transaction, semIsolamentoEscritorio: true })
  }

  const principal = clientes.find(cliente => Number(cliente.id) === principalId) || clientes[0]
  await usuario.update({ clienteVinculado: principal.nome }, { transaction, semIsolamentoEscritorio: true })

  return clientesVinculadosAoUsuario(usuario, { transaction })
}

module.exports = {
  numeroId,
  idsUnicos,
  clientePublico,
  clientesVinculadosAoUsuario,
  escolherClienteAtivo,
  substituirClientesDoUsuario,
}

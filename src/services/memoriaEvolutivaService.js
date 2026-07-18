const { Op } = require("sequelize")
const MemoriaNexa = require("../models/MemoriaNexa")

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function limparConteudo(valor) {
  return String(valor || "")
    .replace(/^\s*(lembre(?:-se)?\s+(?:de\s+)?que|lembra\s+que|guarde\s+que|anote\s+que|registre\s+que|a partir de agora)\s*[:,;-]?\s*/i, "")
    .replace(/[\s.]+$/g, "")
    .trim()
}

function contemDadoSensivel(texto) {
  const valor = normalizar(texto)
  return /(senha|token|chave privada|api key|apikey|arquivo pfx|codigo de acesso|secret|jwt)/.test(valor)
}

function detectarPedidoMemoria(mensagem) {
  const texto = String(mensagem || "").trim()
  const normalizado = normalizar(texto)

  if (/^(esqueca|apague da memoria|remova da memoria|nao lembre)\b/.test(normalizado)) {
    const termo = texto
      .replace(/^\s*(esqueça|esqueca|apague da memória|apague da memoria|remova da memória|remova da memoria|não lembre|nao lembre)\s*(?:que|de)?\s*/i, "")
      .replace(/[\s.]+$/g, "")
      .trim()
    return { tipo: "esquecer", conteudo: termo }
  }

  if (/^(lembre(?:-se)?\b|lembra\s+que\b|guarde\s+que\b|anote\s+que\b|registre\s+que\b|a partir de agora\b)/.test(normalizado)) {
    return { tipo: "lembrar", conteudo: limparConteudo(texto) }
  }

  return null
}

function definirEscopo({ clienteId, conversaId, tipoContexto }) {
  if (clienteId) return "cliente"
  if (tipoContexto === "interessado" && conversaId) return "interessado"
  return "escritorio"
}

async function registrarMemoria({ usuarioId, clienteId = null, conversaId = null, tipoContexto = "geral", conteudo, categoria = "preferencia" }) {
  const texto = String(conteudo || "").trim()
  if (!texto) return { registrada: false, motivo: "vazia" }
  if (contemDadoSensivel(texto)) return { registrada: false, motivo: "sensivel" }

  const escopo = definirEscopo({ clienteId, conversaId, tipoContexto })
  const existente = await MemoriaNexa.findOne({
    where: {
      usuarioId,
      escopo,
      clienteId: clienteId || null,
      conversaId: escopo === "interessado" ? conversaId : null,
      conteudo: texto,
      ativa: true,
    },
  })

  if (existente) return { registrada: true, memoria: existente, duplicada: true }

  const memoria = await MemoriaNexa.create({
    usuarioId,
    escopo,
    clienteId: clienteId || null,
    conversaId: escopo === "interessado" ? conversaId : null,
    categoria,
    conteudo: texto,
    origem: "usuario",
    confirmada: true,
    ativa: true,
  })

  return { registrada: true, memoria, duplicada: false }
}

async function esquecerMemoria({ usuarioId, clienteId = null, conversaId = null, termo = "" }) {
  const busca = String(termo || "").trim()
  if (!busca) return { removidas: 0 }

  const memorias = await MemoriaNexa.findAll({
    where: {
      usuarioId,
      ativa: true,
      [Op.or]: [
        { clienteId: clienteId || null },
        { conversaId: conversaId || null },
        { escopo: "escritorio" },
      ],
    },
    order: [["updatedAt", "DESC"]],
    limit: 100,
  })

  const termoNormalizado = normalizar(busca)
  const correspondentes = memorias.filter((item) => normalizar(item.conteudo).includes(termoNormalizado))

  await Promise.all(correspondentes.map((item) => item.update({ ativa: false })))
  return { removidas: correspondentes.length }
}

async function obterMemoriasRelevantes({ usuarioId, clienteId = null, conversaId = null, tipoContexto = "geral", limite = 20 }) {
  const condicoes = [{ escopo: "escritorio", clienteId: null }]
  if (clienteId) condicoes.push({ escopo: "cliente", clienteId })
  if (tipoContexto === "interessado" && conversaId) condicoes.push({ escopo: "interessado", conversaId })

  const memorias = await MemoriaNexa.findAll({
    where: {
      usuarioId,
      ativa: true,
      [Op.or]: condicoes,
    },
    order: [["updatedAt", "DESC"]],
    limit: Math.max(1, Math.min(Number(limite) || 20, 50)),
  })

  return memorias.map((item) => ({
    id: item.id,
    escopo: item.escopo,
    categoria: item.categoria,
    conteudo: item.conteudo,
    clienteId: item.clienteId,
    conversaId: item.conversaId,
  }))
}

module.exports = {
  detectarPedidoMemoria,
  registrarMemoria,
  esquecerMemoria,
  obterMemoriasRelevantes,
}

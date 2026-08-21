const { diagnosticarSaldoAnterior } = require("./saldoConciliacaoService")

const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 }

function normalizar(texto) { return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }

function pareceDiagnosticoSaldoAnterior(mensagem) {
  const texto = normalizar(mensagem)
  return /\bsaldo\s+(anterior|inicial)\b/.test(texto) && /\b(por que|porque|erro|errado|indevido|apareceu|origem|causa|diagnostic|verific|corrig)\b/.test(texto)
}

function competenciaDaMensagem(mensagem, agora = new Date()) {
  const texto = normalizar(mensagem)
  const numerica = texto.match(/\b(0?[1-9]|1[0-2])[\/-](20\d{2})\b/)
  if (numerica) return `${numerica[2]}-${String(Number(numerica[1])).padStart(2, "0")}`
  for (const [nome, mes] of Object.entries(MESES)) {
    const achado = texto.match(new RegExp(`\\b${nome}(?:\\s+(?:de\\s+)?)?(20\\d{2})?\\b`))
    if (achado) return `${achado[1] || agora.getFullYear()}-${String(mes).padStart(2, "0")}`
  }
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`
}

function numero(valor) { const convertido = Number(valor || 0); return Number.isFinite(convertido) ? convertido : 0 }
function moeda(valor) { return numero(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }

async function diagnosticarSaldoPelaNexa({ mensagem, cliente, usuario }) {
  if (!pareceDiagnosticoSaldoAnterior(mensagem)) return null
  if (usuario?.perfil !== "Administrador") return { resposta: "Esse diagnóstico técnico é restrito ao administrador.", modo: "nexa-autodiagnostico-bloqueado" }
  if (!cliente?.id) return { resposta: "Abra primeiro o cliente que deseja diagnosticar.", modo: "nexa-autodiagnostico-contexto" }
  const { Op } = require("sequelize")
  const ContaBancariaCliente = require("../models/ContaBancariaCliente")
  const MovimentoBancario = require("../models/MovimentoBancario")
  const conta = await ContaBancariaCliente.findOne({ where: { clienteId: cliente.id, ativo: true }, order: [["principal", "DESC"], ["id", "ASC"]] })
  if (!conta) return { resposta: `${cliente.nome} não possui conta bancária ativa cadastrada.`, modo: "nexa-autodiagnostico-sem-conta" }

  const competencia = competenciaDaMensagem(mensagem)
  const inicioCompetencia = `${competencia}-01`
  const movimentos = await MovimentoBancario.findAll({ where: { contaBancariaId: conta.id, data: { [Op.lt]: inicioCompetencia } }, order: [["data", "ASC"], ["id", "ASC"]] })
  const diagnostico = diagnosticarSaldoAnterior({ saldoInicial: conta.saldoInicial, dataSaldoInicial: conta.dataSaldoInicial, inicioCompetencia, movimentos })
  const antigos = diagnostico.movimentosAnterioresAoMarco
  const detalhe = antigos.slice(0, 5).map((item) => `${String(item.data).split("-").reverse().join("/")} — ${item.descricao}: ${moeda(item.valorAssinado)}`)
  const resposta = diagnostico.inconsistente
    ? `Encontrei a causa do saldo anterior de ${cliente.nome}. Há ${antigos.length} movimento(s) anterior(es) ao início do controle da conta em ${String(conta.dataSaldoInicial).split("-").reverse().join("/")}. Eles não serão apagados: permanecerão no histórico, mas a regra preventiva já os exclui do cálculo. O saldo anterior correto para ${competencia.split("-").reverse().join("/")} é ${moeda(diagnostico.saldoAnterior)}.${detalhe.length ? ` Movimentos identificados: ${detalhe.join("; ")}.` : ""}`
    : `Analisei o saldo anterior de ${cliente.nome}. O valor correto para ${competencia.split("-").reverse().join("/")} é ${moeda(diagnostico.saldoAnterior)}. Não encontrei movimentos anteriores ao marco inicial da conta.`
  return { resposta, modo: "nexa-autodiagnostico-saldo", atividade: "autodiagnostico", provedor: "sistema", modelo: "Nexa Autodiagnóstico 1.0", diagnostico: { tipo: "saldo-anterior", clienteId: cliente.id, contaBancariaId: conta.id, competencia, saldoAnteriorCorreto: diagnostico.saldoAnterior, inconsistencias: antigos.length, prevencaoAtiva: diagnostico.prevencaoAtiva, alteracaoExecutada: false } }
}

module.exports = { competenciaDaMensagem, diagnosticarSaldoPelaNexa, pareceDiagnosticoSaldoAnterior }

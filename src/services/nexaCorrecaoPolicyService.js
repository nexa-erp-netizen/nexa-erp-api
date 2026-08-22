const MODELOS_PERMITIDOS = new Set([
  "Financeiro", "ServicoAvulso", "Fiscal", "MovimentoCliente",
  "LancamentoContabil", "DocumentoDigital", "DasMei",
])
const CAMPOS_PERMITIDOS = new Set([
  "status", "dataPagamento", "dataRecebimento", "vencimento",
  "observacao", "alertaFiscal", "situacao", "origem",
])

function valorSeguro(campo, valor) {
  if (valor === null) return null
  if (["dataPagamento", "dataRecebimento", "vencimento"].includes(campo)) {
    const data = String(valor || "").slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`${campo} deve estar no formato AAAA-MM-DD`)
    return data
  }
  const limite = campo === "observacao" ? 1000 : 120
  const texto = String(valor ?? "").trim().slice(0, limite)
  if (!texto) throw new Error(`${campo} não pode ficar vazio`)
  return texto
}

function validarProposta({ modelo, registroId, alteracoes }) {
  const nomeModelo = String(modelo || "").trim()
  const id = Number(registroId)
  if (!MODELOS_PERMITIDOS.has(nomeModelo)) throw new Error("Módulo não autorizado para correção autônoma")
  if (!Number.isInteger(id) || id <= 0) throw new Error("Registro inválido")
  if (!alteracoes || typeof alteracoes !== "object" || Array.isArray(alteracoes)) throw new Error("Alterações inválidas")
  const entradas = Object.entries(alteracoes)
  if (!entradas.length || entradas.length > 5) throw new Error("Informe de uma a cinco alterações")
  const limpas = {}
  for (const [campo, valor] of entradas) {
    if (!CAMPOS_PERMITIDOS.has(campo)) throw new Error(`Campo não autorizado: ${campo}`)
    limpas[campo] = valorSeguro(campo, valor)
  }
  return { modelo: nomeModelo, registroId: id, alteracoes: limpas }
}

module.exports = { validarProposta }

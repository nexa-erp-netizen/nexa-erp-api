function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

const CORRECOES_DIRETAS = new Map(Object.entries({
  visualise: "visualize",
  visualisar: "visualizar",
  visualisacao: "visualização",
  inadinplente: "inadimplente",
  inadinplentes: "inadimplentes",
  inadiplente: "inadimplente",
  inadiplentes: "inadimplentes",
  pendecia: "pendência",
  pendencias: "pendências",
  historico: "histórico",
  honorarios: "honorários",
  lancameto: "lançamento",
  lancamento: "lançamento",
  lançameto: "lançamento",
  relatorio: "relatório",
  relatorios: "relatórios",
  concilicao: "conciliação",
  conciliacao: "conciliação",
  funcionaro: "funcionário",
  funcionario: "funcionário",
  escritrio: "escritório",
  escritorio: "escritório",
  financero: "financeiro",
  certificdo: "certificado",
  procuracao: "procuração",
  obrigacao: "obrigação",
  usuario: "usuário",
  usuarios: "usuários",
  vencimeto: "vencimento",
  recebdo: "recebido",
  atrazado: "atrasado",
  cancelameto: "cancelamento",
  exclur: "excluir",
  corrijir: "corrigir",
  corrije: "corrige",
  concegue: "consegue",
  conseque: "consegue",
  vizualizar: "visualizar",
  vizualize: "visualize",
}))

const TERMOS_SEGUROS = [
  "visualizar", "visualize", "visualização", "analisar", "analise", "identificar",
  "verificar", "corrigir", "corrige", "consultar", "consulta", "abrir", "excluir",
  "bloquear", "desbloquear", "cancelar", "confirmar", "cliente", "clientes", "sistema",
  "dashboard", "histórico", "anotações", "pendência", "pendências", "inadimplente",
  "honorários", "lançamento", "lançamentos", "relatório", "relatórios", "financeiro",
  "fiscal", "contábil", "contabilidade", "documento", "documentos", "certificado",
  "certificados", "procuração", "procurações", "conciliação", "funcionário", "funcionários",
  "vencimento", "vencimentos", "pagamento", "pagamentos", "recebido", "atrasado",
  "prioridade", "prioridades", "obrigação", "obrigações", "serviço", "serviços",
  "cobrança", "cobranças", "movimento", "movimentos", "usuário", "usuários",
  "escritório", "empresa", "empresas", "melhoria", "melhorias", "layout", "tela",
].map((termo) => ({ termo, normalizado: normalizar(termo) }))

function distanciaDamerau(a, b) {
  const origem = normalizar(a)
  const destino = normalizar(b)
  const matriz = Array.from({ length: origem.length + 1 }, () => Array(destino.length + 1).fill(0))
  for (let i = 0; i <= origem.length; i += 1) matriz[i][0] = i
  for (let j = 0; j <= destino.length; j += 1) matriz[0][j] = j
  for (let i = 1; i <= origem.length; i += 1) {
    for (let j = 1; j <= destino.length; j += 1) {
      const custo = origem[i - 1] === destino[j - 1] ? 0 : 1
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + custo,
      )
      if (i > 1 && j > 1 && origem[i - 1] === destino[j - 2] && origem[i - 2] === destino[j - 1]) {
        matriz[i][j] = Math.min(matriz[i][j], matriz[i - 2][j - 2] + custo)
      }
    }
  }
  return matriz[origem.length][destino.length]
}

function preservarCaixa(original, corrigido) {
  if (original === original.toUpperCase()) return corrigido.toUpperCase()
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(original)) return corrigido.charAt(0).toUpperCase() + corrigido.slice(1)
  return corrigido
}

function candidatoSeguro(palavra) {
  const termo = normalizar(palavra)
  if (termo.length < 5 || !/^[a-zçáéíóúâêôãõ]+$/i.test(palavra)) return null
  if (TERMOS_SEGUROS.some((item) => item.normalizado === termo)) return null
  const maximo = termo.length >= 8 ? 2 : 1
  const candidatos = TERMOS_SEGUROS
    .map((item) => ({ ...item, distancia: distanciaDamerau(termo, item.normalizado) }))
    .filter((item) => item.distancia > 0 && item.distancia <= maximo)
    .sort((a, b) => a.distancia - b.distancia || a.normalizado.length - b.normalizado.length)
  if (!candidatos.length) return null
  const melhor = candidatos[0]
  const segundo = candidatos[1]
  if (segundo && segundo.distancia === melhor.distancia && segundo.normalizado !== melhor.normalizado) return null
  const confianca = Math.round((1 - melhor.distancia / Math.max(termo.length, melhor.normalizado.length)) * 100)
  if (confianca < 78) return null
  return { correto: melhor.termo, confianca, distancia: melhor.distancia }
}

function corrigirMensagemNatural({ mensagem }) {
  const original = String(mensagem || "").trim()
  if (!original) return { texto: original, alterada: false, substituicoes: [] }
  const substituicoes = []
  const texto = original.replace(/[\p{L}]+/gu, (palavra) => {
    const termo = normalizar(palavra)
    const direta = CORRECOES_DIRETAS.get(termo)
    const candidato = direta ? { correto: direta, confianca: 100, distancia: 1 } : candidatoSeguro(palavra)
    if (!candidato || (!direta && normalizar(candidato.correto) === termo)) return palavra
    const correto = preservarCaixa(palavra, candidato.correto)
    substituicoes.push({ termoOuvido: palavra, termoCorreto: correto, origem: "compreensao-natural", confianca: candidato.confianca })
    return correto
  })
  return { texto, alterada: texto !== original, substituicoes }
}

module.exports = { corrigirMensagemNatural, distanciaDamerau }

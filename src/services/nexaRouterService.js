function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const INTENCOES_CONSULTA = [
  {
    intencao: "cliente",
    padroes: [
      /\b(?:cpf|cnpj|telefone|celular|whatsapp|e-mail|email|endereco|cep|data de nascimento) (?:do|da|de) (?:cliente |empresa )?[a-z]/,
      /\b(?:preciso|quero|informe|mostre|consulte|procure|busque|qual|me passe|passe) (?:do |da |o |a )*(?:cpf|cnpj|telefone|celular|whatsapp|e-mail|email|endereco|cep|data de nascimento|historico|anotacoes?)\b/,
      /\b(?:historico|anotacoes?) (?:do|da|de) (?:cliente |empresa )?[a-z]/,
    ],
  },
  {
    intencao: "prioridades-hoje",
    padroes: [
      /\b(iniciar (?:o|meu) dia)\b/,
      /\b(prioridades?|resumo|panorama|relatorio operacional) (?:de|do|para|pra) hoje\b/,
      /\bo que (?:eu )?(?:tenho|preciso) (?:para )?(?:fazer|resolver) hoje\b/,
    ],
  },
  {
    intencao: "pendencias-gerais",
    padroes: [
      /\b(?:mostre|liste|informe|quais sao|quais|ver|consultar)? ?(?:todas as )?pendencias\b/,
      /\bo que (?:esta|esta) pendente\b/,
    ],
  },
  {
    intencao: "pagamentos-hoje",
    padroes: [
      /\bquem pagou(?: hoje)?\b/,
      /\b(?:quais )?pagamentos? (?:foram )?(?:recebidos?|realizados?)(?: hoje)?\b/,
      /\bquanto entrou hoje\b/,
    ],
  },
  {
    intencao: "resolvidas-hoje",
    padroes: [
      /\b(?:pendencias?|itens?|tarefas?) (?:resolvidas?|concluidas?|finalizadas?)(?: hoje)?\b/,
      /\bo que (?:foi|esta) concluido hoje\b/,
    ],
  },
  {
    intencao: "mensagens-pendentes",
    padroes: [
      /\bmensagens? (?:pendentes?|de clientes?|recebidas?)\b/,
      /\b(?:tem|ha) (?:alguma )?mensagem de cliente\b/,
      /\bpedidos? de ajuda\b/,
    ],
  },
  {
    intencao: "documentos-pendentes",
    padroes: [
      /\bdocumentos? (?:recebidos?|enviados? pelos? clientes?|pendentes?|aguardando analise)\b/,
      /\bquais (?:documentos?|arquivos?) (?:os )?clientes? enviaram\b/,
    ],
  },
  {
    intencao: "financeiro",
    padroes: [
      /\b(?:mostre|liste|informe|quais|quem sao)? ?(?:os )?clientes? inadimplentes?\b/,
      /\bclientes? (?:em atraso|que devem|devendo)\b/,
      /\bquem (?:esta )?devendo(?: honorarios?)?\b/,
      /\bquem deve para o escritorio\b/,
      /\bhonorarios? (?:pendentes?|a receber|em atraso)\b/,
      /\b(?:consulte|mostre|ver|quero ver) (?:o )?financeiro\b/,
    ],
  },
]

const VERBO_NAVEGACAO = /\b(abra|abre|abri|abrir|acesse|acessar|entre|entrar|va|vai|volte|voltar|retorne|retornar|navegue|ir|me leve|mostre a tela)\b/
const DESTINO_NAVEGACAO = /\b(dashboard|inicio|home|fiscal|financeiro|clientes?|central do cliente|historico|anotacoes?|cadastro (?:dele|dela|desse cliente|deste cliente|desse cliente|dessa empresa|desta empresa)|servicos? e cobrancas?|servicos? avulsos?|movimentos?|lancamentos? contabeis?|documentos? digitais?|agenda|relatorios?|usuarios?|backup|sobre|portal do cliente)\b/
const CODIGO_CLIENTE = /\bcli[- ]?0*\d+\b/
const REFERENCIA_CLIENTE = /\b(?:abra|abre|abrir|acesse|entre|entrar|va para|ir para)\s+(?:o cliente|a cliente|o cadastro de|a empresa)?\s*[a-z][a-z0-9 '&.-]{1,80}(?:\s+e\s+(?:abra|entre|va|acesse))?/

function classificarMensagemOperacional(mensagem) {
  const texto = normalizar(mensagem)
  if (!texto) return null

  const temVerbo = VERBO_NAVEGACAO.test(texto)
  const temDestino = DESTINO_NAVEGACAO.test(texto)
  const temCliente = CODIGO_CLIENTE.test(texto) || REFERENCIA_CLIENTE.test(texto)

  // Um verbo explícito de abertura sempre prevalece sobre a palavra do dado.
  // “Abra as anotações do cliente” navega; “quais são as anotações” consulta.
  if (temVerbo && (temDestino || temCliente)) {
    return {
      tipo: "navegacao",
      intencao: "navegar",
      deterministica: true,
      usaIa: false,
    }
  }

  for (const grupo of INTENCOES_CONSULTA) {
    if (grupo.padroes.some((padrao) => padrao.test(texto))) {
      return {
        tipo: "consulta",
        intencao: grupo.intencao,
        deterministica: true,
        usaIa: false,
      }
    }
  }

  return null
}

module.exports = {
  classificarMensagemOperacional,
  normalizarMensagemOperacional: normalizar,
}

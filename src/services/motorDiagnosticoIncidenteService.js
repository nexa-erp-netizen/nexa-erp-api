function normalizar(valor) { return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() }

function diagnosticarIncidente(dados = {}) {
  const texto = normalizar([dados.titulo, dados.mensagem, dados.rota, dados.componente].join(" "))
  const status = Number(dados.statusHttp || 0)
  const base = { categoria: "Erro não classificado", causaProvavel: "A causa ainda precisa ser correlacionada com os logs e dados da operação.", correcaoSugerida: "Reproduzir a operação em ambiente de teste e verificar o primeiro erro da sequência.", risco: "Médio", confianca: 35, autocorrecaoPermitida: false }

  if (/model.*does not exist|modelo.*nao existe|do not have access|groq.*model/.test(texto)) return { categoria: "Configuração de IA", causaProvavel: "O modelo de IA configurado foi removido ou não está liberado para a conta.", correcaoSugerida: "Selecionar um modelo de produção disponível, testar a conexão e atualizar GROQ_MODEL.", risco: "Baixo", confianca: 98, autocorrecaoPermitida: true, codigoCorrecao: "ATUALIZAR_MODELO_IA" }
  if (/timeout|timed out|econnaborted|aborterror|tempo esgotado/.test(texto)) return { categoria: "Tempo de resposta", causaProvavel: "A operação excedeu o tempo limite ou o serviço dependente ficou indisponível.", correcaoSugerida: "Verificar latência, reduzir a consulta e aplicar nova tentativa controlada.", risco: "Médio", confianca: 82, autocorrecaoPermitida: false }
  if (status === 401 || /unauthorized|token expirado|jwt/.test(texto)) return { categoria: "Autenticação", causaProvavel: "A sessão expirou ou o token não foi aceito.", correcaoSugerida: "Renovar a sessão e validar o fluxo de autenticação.", risco: "Baixo", confianca: 92, autocorrecaoPermitida: true, codigoCorrecao: "RENOVAR_SESSAO" }
  if (status === 403 || /forbidden|acesso negado|acesso restrito/.test(texto)) return { categoria: "Permissão", causaProvavel: "O perfil atual não possui autorização para a operação.", correcaoSugerida: "Conferir o perfil e a regra de acesso sem ampliar permissões automaticamente.", risco: "Alto", confianca: 90, autocorrecaoPermitida: false }
  if (/sequelize|postgres|database|constraint|column .* does not exist|relation .* does not exist/.test(texto)) return { categoria: "Banco de dados", causaProvavel: "A consulta, estrutura ou restrição do banco rejeitou a operação.", correcaoSugerida: "Comparar o modelo com a tabela, preservar os registros e testar a migração antes de alterar produção.", risco: "Alto", confianca: 88, autocorrecaoPermitida: false }
  if (/minified react error|react.*error|cannot read propert|is not a function|undefined/.test(texto) && String(dados.origem || "").startsWith("web")) return { categoria: "Interface Web", causaProvavel: "Um componente tentou utilizar um valor ou função inexistente durante a renderização.", correcaoSugerida: "Localizar o componente e a pilha, adicionar proteção e executar o build do Web.", risco: "Médio", confianca: 84, autocorrecaoPermitida: false }
  if (status === 404) return { categoria: "Rota ou registro ausente", causaProvavel: "A rota solicitada ou o registro referenciado não foi encontrado.", correcaoSugerida: "Validar o endereço, o identificador e o isolamento do escritório antes de repetir.", risco: "Baixo", confianca: 80, autocorrecaoPermitida: false }
  if (status >= 500) return { ...base, categoria: "Falha interna da API", causaProvavel: "A API interrompeu a operação por uma exceção interna.", correcaoSugerida: "Correlacionar a rota com o log do mesmo horário e reproduzir com dados protegidos.", confianca: 65 }
  return base
}

module.exports = { diagnosticarIncidente }

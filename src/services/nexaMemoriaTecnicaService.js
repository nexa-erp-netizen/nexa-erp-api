const { Op } = require("sequelize")
const MemoriaNexa = require("../models/MemoriaNexa")

const VERSAO_MEMORIA = "NEXA-TECH-v1"
const CONTEUDO_MEMORIA = `[${VERSAO_MEMORIA}] Projeto Nexa ERP. Arquitetura: Web React/Vite publicada na Vercel; API Node/Express publicada no Render; PostgreSQL no Render; documentos privados no Supabase; código nos repositórios GitHub API e Web. Perfis: Administrador, Funcionário, Empresa e Cliente; o Modo Desenvolvedor e a IA administrativa são exclusivos do Administrador. O Modo Desenvolvedor pode consultar API e Web, localizar arquivos, analisar código, preparar correções pequenas em branch separada, criar pull request, acompanhar testes e publicar somente após autorização explícita do Administrador. Nunca publicar com “ok” ambíguo, nunca expor credenciais e nunca alterar autenticação, modelos, migrations, dependências ou arquivos sensíveis automaticamente. Fluxo obrigatório: analisar → preparar → testar → apresentar arquivos e resultado → aguardar autorização → publicar → validar. A correção de dados do ERP também exige plano, confirmação, transação, conferência e registro. Decisões do projeto: respostas em português simples; OpenAI é a IA principal; Groq pode ser reserva; documentos disponíveis para baixar não são pendências; itens pagos ou recebidos não devem continuar como atrasados; histórico não deve ser apagado; bloqueio de usuário ou portal não exclui cadastro. Estado técnico: acesso GitHub configurado para API e Web; leitura de código disponível; análise por tela ou módulo disponível; publicação protegida por confirmação.`

async function garantirMemoriaTecnica(usuario) {
  if (!usuario?.id || usuario?.perfil !== "Administrador") return null
  const existente = await MemoriaNexa.findOne({
    where: {
      usuarioId: usuario.id,
      escopo: "escritorio",
      categoria: "tecnica-projeto",
      conteudo: { [Op.like]: `[${VERSAO_MEMORIA}]%` },
      ativa: true,
    },
  })
  if (existente) return existente
  await MemoriaNexa.update({ ativa: false }, {
    where: {
      usuarioId: usuario.id,
      escopo: "escritorio",
      categoria: "tecnica-projeto",
      origem: "sistema",
      ativa: true,
    },
  })
  return MemoriaNexa.create({
    usuarioId: usuario.id,
    escopo: "escritorio",
    clienteId: null,
    conversaId: null,
    categoria: "tecnica-projeto",
    conteudo: CONTEUDO_MEMORIA,
    origem: "sistema",
    confirmada: true,
    ativa: true,
  })
}

module.exports = { garantirMemoriaTecnica, VERSAO_MEMORIA, CONTEUDO_MEMORIA }

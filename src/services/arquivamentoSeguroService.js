function validarArquivamentoUsuario(usuario, solicitante) {
  if (!usuario) return { permitido: false, status: 404, mensagem: "Usuário não encontrado" }
  if (Number(usuario.id) === Number(solicitante?.id)) return { permitido: false, status: 400, mensagem: "Você não pode excluir o próprio acesso" }
  if (usuario.plataformaAdmin === true) return { permitido: false, status: 403, mensagem: "O administrador da plataforma não pode ser excluído" }
  return { permitido: true }
}

function validarArquivamentoEscritorio(escritorio, solicitante, possuiAdminPlataforma = false) {
  if (!escritorio) return { permitido: false, status: 404, mensagem: "Escritório não encontrado" }
  if (Number(escritorio.id) === Number(solicitante?.escritorioId)) return { permitido: false, status: 403, mensagem: "O escritório principal não pode ser excluído" }
  if (possuiAdminPlataforma) return { permitido: false, status: 403, mensagem: "O escritório do administrador da plataforma não pode ser excluído" }
  return { permitido: true }
}

function confirmacaoNomeValida(nome, confirmacao) {
  return String(confirmacao || "").trim() === String(nome || "").trim()
}

module.exports = { validarArquivamentoUsuario, validarArquivamentoEscritorio, confirmacaoNomeValida }

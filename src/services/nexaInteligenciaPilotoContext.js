const { AsyncLocalStorage } = require("node:async_hooks")

const storage = new AsyncLocalStorage()

function executarComUsuario(usuario, callback) {
  return storage.run({ usuario }, callback)
}

function usuarioAtual() {
  return storage.getStore()?.usuario || null
}

module.exports = { executarComUsuario, usuarioAtual }

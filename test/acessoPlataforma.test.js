const test = require("node:test")
const assert = require("node:assert/strict")
const { ehAdministradorPlataforma, exigirAdministradorPlataforma } = require("../src/utils/acessoPlataforma")

test("somente administrador da plataforma recebe acesso técnico", () => {
  assert.equal(ehAdministradorPlataforma({ perfil: "Administrador", plataformaAdmin: true }), true)
  assert.equal(ehAdministradorPlataforma({ perfil: "Administrador", plataformaAdmin: false }), false)
  assert.equal(ehAdministradorPlataforma({ perfil: "Funcionário", plataformaAdmin: true }), false)
  assert.equal(ehAdministradorPlataforma(null), false)
})

test("middleware bloqueia administrador comum do escritório", () => {
  let status = null
  let corpo = null
  let avancou = false
  const req = { method: "GET", originalUrl: "/incidentes", usuario: { id: 8, escritorioId: 4, perfil: "Administrador", plataformaAdmin: false } }
  const res = { status(codigo) { status = codigo; return this }, json(valor) { corpo = valor; return this } }
  exigirAdministradorPlataforma(req, res, () => { avancou = true })
  assert.equal(avancou, false)
  assert.equal(status, 403)
  assert.deepEqual(corpo, { message: "Acesso exclusivo do administrador da plataforma." })
})

test("middleware bloqueia perfil não administrador mesmo com marca técnica inconsistente", () => {
  let status = null
  let avancou = false
  const req = { method: "POST", originalUrl: "/escritorios", usuario: { id: 9, escritorioId: 4, perfil: "Profissional", plataformaAdmin: true } }
  const res = { status(codigo) { status = codigo; return this }, json() { return this } }
  exigirAdministradorPlataforma(req, res, () => { avancou = true })
  assert.equal(avancou, false)
  assert.equal(status, 403)
})

test("middleware libera somente o administrador da plataforma", () => {
  let avancou = false
  exigirAdministradorPlataforma({ usuario: { perfil: "Administrador", plataformaAdmin: true } }, {}, () => { avancou = true })
  assert.equal(avancou, true)
})

const test = require("node:test")
const assert = require("node:assert/strict")
const { ipDaRequisicao, resumirDispositivo } = require("../src/services/acessoEscritorioService")

test("registra somente o primeiro IP encaminhado", () => {
  assert.equal(ipDaRequisicao({ headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }), "203.0.113.7")
})

test("resume sistema e navegador sem salvar o agente completo", () => {
  const dispositivo = resumirDispositivo({ headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36" } })
  assert.equal(dispositivo, "Windows • Chrome")
})

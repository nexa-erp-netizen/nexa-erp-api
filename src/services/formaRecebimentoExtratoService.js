function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function classificarFormaRecebimento(item) {
  const texto = normalizar(`${item?.descricao || ""} ${item?.tipoBanco || ""}`)
  if (/\bpix\b|pix recebido|recebimento pix|transf pix/.test(texto)) return "PIX"
  if (/cartao|maquininha|adquirente|stone|cielo|redecard|rede itau|pagseguro|pagbank|sumup|getnet|infinitepay|infinite pay|safrapay|sipag|moderninha|mercado pago|mercadopago|\bton\b|\bvero\b/.test(texto)) return "Cartão"
  return null
}

module.exports = { classificarFormaRecebimento }

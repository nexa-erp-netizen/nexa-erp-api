const SITES_OFICIAIS_NEXA = [
  { titulo: "Carteira de Trabalho Digital", url: "https://www.gov.br/pt-br/servicos/obter-a-carteira-de-trabalho", aliases: ["carteira de trabalho digital", "carteira de trabalho", "ctps digital", "ctps"] },
  { titulo: "Portal e-CAC", url: "https://cav.receita.fazenda.gov.br/autenticacao/login", aliases: ["portal e-cac", "portal e cac", "e-cac", "e cac", "ecac"] },
  { titulo: "Portal do Simples Nacional", url: "https://www8.receita.fazenda.gov.br/simplesnacional/", aliases: ["portal do simples nacional", "simples nacional", "portal do simples"] },
  { titulo: "PGMEI", url: "https://www8.receita.fazenda.gov.br/simplesnacional/aplicacoes/atspo/pgmei.app/", aliases: ["pgmei", "das mei", "gerador do das mei"] },
  { titulo: "Emissor Nacional de NFS-e", url: "https://www.nfse.gov.br/emissornacional", aliases: ["emissor nacional de nfs-e", "emissor nacional de nfse", "emissor nacional de nfs e", "emissor nacional", "portal da nfs-e", "portal da nfse", "portal da nfs e"] },
  { titulo: "Receita Federal", url: "https://www.gov.br/receitafederal/pt-br", aliases: ["receita federal", "site da receita"] },
  { titulo: "Portal Gov.br", url: "https://www.gov.br/pt-br", aliases: ["portal gov br", "gov br"] },
]

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escaparRegex(valor) {
  return String(valor || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function contemPalavra(texto, palavra) {
  return new RegExp(`(^|\\s)${escaparRegex(palavra)}(?=\\s|$)`).test(texto)
}

function temVerboAbrir(texto) {
  return /(^|\s)(abra|abre|abri|abrir|acessa|acesse|acessar|entra|entre|entrar|vai|va|ir|navega|navegue|navegar|mostra|mostre|mostrar|exiba|exibir|ver|me leva|me leve)(\s|$)/.test(texto)
}

function hostOficialPermitido(hostname) {
  const host = String(hostname || "").toLowerCase()
  return host === "gov.br"
    || host.endsWith(".gov.br")
    || host === "receita.fazenda.gov.br"
    || host.endsWith(".receita.fazenda.gov.br")
    || host === "nfse.gov.br"
    || host.endsWith(".nfse.gov.br")
}

function extrairUrlOficialDaMensagem(mensagem) {
  const encontrada = String(mensagem || "").match(/https:\/\/[^\s<>'"]+/i)?.[0]
  if (!encontrada) return null

  try {
    const url = new URL(encontrada.replace(/[),.;!?]+$/, ""))
    return url.protocol === "https:" && hostOficialPermitido(url.hostname) ? url.toString() : null
  } catch {
    return null
  }
}

function detectarSiteParaAbrir(mensagem) {
  const texto = normalizar(mensagem)
  if (!texto || !temVerboAbrir(texto)) return null

  const urlExplicita = extrairUrlOficialDaMensagem(mensagem)
  if (urlExplicita) return { titulo: "Site oficial", url: urlExplicita, origem: "url-explicita" }

  const candidatos = SITES_OFICIAIS_NEXA
    .flatMap((site) => site.aliases.map((alias) => ({ ...site, alias: normalizar(alias) })))
    .sort((a, b) => b.alias.length - a.alias.length)
  const site = candidatos.find((item) => contemPalavra(texto, item.alias))
  return site ? { titulo: site.titulo, url: site.url, origem: "site-oficial" } : null
}

module.exports = { detectarSiteParaAbrir, hostOficialPermitido, SITES_OFICIAIS_NEXA }

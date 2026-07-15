const Cliente = require("../models/Cliente")

function numero(valor, nome, { obrigatorio = true, minimo = 0 } = {}) {
  if ((valor === "" || valor === null || valor === undefined) && !obrigatorio) return null
  const convertido = Number(valor)
  if (!Number.isFinite(convertido) || convertido < minimo) {
    const erro = new Error(`${nome} deve ser um número válido${minimo > 0 ? ` maior ou igual a ${minimo}` : ""}.`)
    erro.status = 400
    throw erro
  }
  return convertido
}

function moeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor || 0)
}

function percentual(valor) {
  return `${Number(valor || 0).toFixed(2).replace(".", ",")}%`
}

function montarCenario(nome, taxa, receitaMensal, observacao) {
  const valorMensal = receitaMensal * (taxa / 100)
  return {
    nome,
    taxaEfetiva: taxa,
    valorMensal,
    valorAnualLinear: valorMensal * 12,
    observacao,
  }
}

async function simularConsultoriaTributaria(req, res) {
  try {
    const clienteId = Number(req.params.clienteId)
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return res.status(400).json({ message: "Cliente inválido" })
    }

    const cliente = await Cliente.findByPk(clienteId)
    if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" })

    if (
      req.usuario?.perfil === "Cliente" &&
      req.usuario?.clienteVinculado &&
      cliente.nome !== req.usuario.clienteVinculado
    ) {
      return res.status(403).json({ message: "Acesso não autorizado" })
    }

    const receitaMensal = numero(req.body.receitaMensal, "Receita mensal", { minimo: 0.01 })
    const rbt12 = numero(req.body.rbt12, "RBT12", { minimo: 0.01 })
    const folha12 = numero(req.body.folha12, "Folha dos últimos 12 meses", { minimo: 0 })
    const taxaSimples = numero(req.body.taxaSimples, "Alíquota efetiva do Simples", { minimo: 0 })
    const taxaPresumido = numero(req.body.taxaPresumido, "Taxa projetada do Lucro Presumido", { obrigatorio: false, minimo: 0 })
    const taxaReal = numero(req.body.taxaReal, "Taxa projetada do Lucro Real", { obrigatorio: false, minimo: 0 })

    const cenarios = [
      montarCenario(
        "Simples Nacional",
        taxaSimples,
        receitaMensal,
        "Estimativa baseada na alíquota efetiva calculada pelo Motor Tributário da Nexa."
      ),
    ]

    if (taxaPresumido !== null) {
      cenarios.push(montarCenario(
        "Lucro Presumido",
        taxaPresumido,
        receitaMensal,
        "Taxa informada pelo contador para comparação preliminar. Deve incluir os tributos aplicáveis ao cenário analisado."
      ))
    }

    if (taxaReal !== null) {
      cenarios.push(montarCenario(
        "Lucro Real",
        taxaReal,
        receitaMensal,
        "Taxa informada pelo contador para comparação preliminar. O resultado definitivo depende do lucro contábil e dos ajustes fiscais."
      ))
    }

    const ordenados = [...cenarios].sort((a, b) => a.valorMensal - b.valorMensal)
    const melhor = ordenados[0]
    const atual = cenarios.find((item) => item.nome === (cliente.regime || "")) || cenarios[0]
    const economiaMensal = Math.max(0, atual.valorMensal - melhor.valorMensal)
    const fatorR = rbt12 > 0 ? folha12 / rbt12 : 0

    const riscos = []
    const oportunidades = []

    if (!cliente.regime) riscos.push("O regime tributário não está preenchido no DNA Empresarial.")
    if (!cliente.ramoAtividade) riscos.push("O ramo de atividade não está preenchido no cadastro.")
    if (rbt12 >= 4320000) riscos.push("A RBT12 está próxima do limite geral do Simples Nacional e exige acompanhamento frequente.")
    if (fatorR > 0 && fatorR < 0.28 && cliente.utilizaFatorR === "Sim") {
      riscos.push(`O Fator R estimado está em ${percentual(fatorR * 100)}, abaixo de 28%.`)
      oportunidades.push("Simular o impacto econômico de uma folha maior, sem decidir apenas pelo efeito tributário.")
    }
    if (economiaMensal > 0) {
      oportunidades.push(`O cenário de menor custo ficou ${moeda(economiaMensal)} abaixo do cenário atual por mês, em projeção linear.`)
    }
    if (cenarios.length === 1) {
      oportunidades.push("Incluir taxas projetadas dos regimes alternativos para uma comparação preliminar mais completa.")
    }

    const diferencas = ordenados.map((cenario) => ({
      ...cenario,
      diferencaParaMelhor: cenario.valorMensal - melhor.valorMensal,
    }))

    return res.json({
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        regime: cliente.regime,
        ramo: cliente.ramoAtividade,
        anexo: cliente.anexoSimples,
      },
      premissas: { receitaMensal, rbt12, folha12, fatorR, fatorRPercentual: fatorR * 100 },
      cenarios: diferencas,
      melhorCenarioMatematico: melhor.nome,
      parecer:
        cenarios.length === 1
          ? "A análise confirma o custo estimado do Simples Nacional. Ainda não há taxas alternativas suficientes para concluir qual regime seria mais econômico."
          : `Na comparação matemática informada, ${melhor.nome} apresentou o menor valor mensal. Esta conclusão é preliminar e depende da validação das premissas, da atividade e das regras específicas de cada regime.`,
      opiniaoTecnica:
        "Minha recomendação é usar esta comparação como triagem. Antes de qualquer mudança de regime, valide escrituração, folha, créditos, ISS/ICMS, retenções e custos fora da guia principal.",
      riscos,
      oportunidades,
      atualizadoEm: new Date().toISOString(),
      aviso:
        "Simulação consultiva para apoio ao contador. Não substitui apuração oficial, revisão da legislação nem planejamento tributário formal.",
    })
  } catch (error) {
    console.error("ERRO NA CONSULTORIA TRIBUTÁRIA:", error)
    return res.status(error.status || 500).json({
      message: error.status ? error.message : "Erro ao gerar a consultoria tributária",
    })
  }
}

module.exports = { simularConsultoriaTributaria }

import { useEffect, useMemo, useState } from "react"
import api from "../services/api"

export default function MovimentosCliente() {
  const linhaVazia = () => ({
    data: "",
    tipo: "Receita",
    planoContaId: "",
    planoContaNome: "",
    descricao: "",
    formaPagamento: "",
    valor: "",
    comprovante: "",
    arquivo: null,
  })

  const [movimentos, setMovimentos] = useState([])
  const [planos, setPlanos] = useState([])
  const [linhas, setLinhas] = useState([
    linhaVazia(),
    linhaVazia(),
    linhaVazia(),
    linhaVazia(),
    linhaVazia(),
  ])

  useEffect(() => {
    carregarTudo()
  }, [])

  async function carregarTudo() {
    await Promise.all([carregarMovimentos(), carregarPlanos()])
  }

  async function carregarMovimentos() {
    const resposta = await api.get("/movimentos-cliente")
    setMovimentos(Array.isArray(resposta.data) ? resposta.data : [])
  }

  async function carregarPlanos() {
    try {
      const resposta = await api.get("/plano-contas")
      setPlanos(Array.isArray(resposta.data) ? resposta.data : [])
    } catch {
      setPlanos([])
    }
  }

  function valorSeguro(valor) {
    const numero = Number(
      String(valor || 0)
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim()
    )

    return Number.isFinite(numero) ? numero : 0
  }

  function formatarMoeda(valor) {
    return valorSeguro(valor).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })
  }

  function formatarData(data) {
    if (!data) return "-"
    return new Date(data + "T00:00:00").toLocaleDateString("pt-BR")
  }

  function atualizarLinha(index, campo, valor) {
    const novas = [...linhas]

    if (campo === "planoContaId") {
      const plano = planos.find((p) => String(p.id) === String(valor))

      novas[index].planoContaId = valor
      novas[index].planoContaNome =
        plano?.nome || plano?.descricao || plano?.conta || ""
    } else {
      novas[index][campo] = valor
    }

    setLinhas(novas)
  }

  function adicionarLinha() {
    setLinhas([...linhas, linhaVazia()])
  }

  function removerLinha(index) {
    const novas = linhas.filter((_, i) => i !== index)

    if (novas.length === 0) {
      setLinhas([linhaVazia()])
      return
    }

    setLinhas(novas)
  }

  async function enviarComprovante(arquivo) {
    if (!arquivo) return ""

    const dados = new FormData()
    dados.append("arquivo", arquivo)

    const resposta = await api.post("/movimentos-cliente/upload", dados, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    })

    return resposta.data.caminho
  }

  async function salvarLancamentos() {
    try {
      const linhasValidas = linhas.filter(
        (linha) =>
          linha.data &&
          linha.descricao &&
          linha.valor
      )

      if (linhasValidas.length === 0) {
        alert("Preencha pelo menos uma linha com data, descrição e valor.")
        return
      }

      const movimentosParaSalvar = []

      for (const linha of linhasValidas) {
        const comprovanteUrl = await enviarComprovante(linha.arquivo)

        movimentosParaSalvar.push({
          tipo: linha.tipo,
          data: linha.data,
          planoContaId: linha.planoContaId || null,
          planoContaNome: linha.planoContaNome,
          descricao: linha.descricao,
          formaPagamento: linha.formaPagamento,
          valor: valorSeguro(linha.valor),
          comprovante: comprovanteUrl,
          status: "Pendente",
        })
      }

      await api.post("/movimentos-cliente/massa", {
        movimentos: movimentosParaSalvar,
      })

      setLinhas([
        linhaVazia(),
        linhaVazia(),
        linhaVazia(),
        linhaVazia(),
        linhaVazia(),
      ])

      await carregarMovimentos()

      alert("Lançamentos salvos com sucesso.")
    } catch (erro) {
      console.error("Erro ao salvar lançamentos:", erro)
      alert("Erro ao salvar lançamentos.")
    }
  }

  async function excluirMovimento(id) {
    if (!window.confirm("Deseja excluir este movimento?")) return

    await api.delete(`/movimentos-cliente/${id}`)
    await carregarMovimentos()
  }

  const resumo = useMemo(() => {
    const receitas = movimentos
      .filter((m) => m.tipo === "Receita")
      .reduce((t, m) => t + valorSeguro(m.valor), 0)

    const despesas = movimentos
      .filter((m) => m.tipo === "Despesa")
      .reduce((t, m) => t + valorSeguro(m.valor), 0)

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
      total: movimentos.length,
    }
  }, [movimentos])

  return (
    <div className="mv-page">
      <style>{`
        .mv-page {
          padding: 30px;
          color: white;
        }

        .mv-title {
          font-size: 34px;
          font-weight: 900;
          margin-bottom: 5px;
        }

        .mv-subtitle {
          opacity: .8;
          margin-bottom: 25px;
        }

        .mv-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 25px;
        }

        .mv-box {
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 18px;
          padding: 18px;
        }

        .mv-box span {
          display: block;
          opacity: .7;
          margin-bottom: 8px;
        }

        .mv-box strong {
          font-size: 20px;
        }

        .green { color: #32f06d; }
        .red { color: #ff5c70; }
        .blue { color: #3cbcff; }

        .mv-card {
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 24px;
          padding: 24px;
          margin-bottom: 25px;
        }

        .mv-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }

        .mv-card-title {
          font-size: 22px;
          font-weight: 900;
        }

        .mv-actions-top {
          display: flex;
          gap: 12px;
        }

        .mv-btn {
          border: none;
          border-radius: 12px;
          padding: 12px 18px;
          font-weight: 900;
          cursor: pointer;
        }

        .mv-btn-add {
          background: #061f47;
          color: white;
          border: 1px solid rgba(255,255,255,.15);
        }

        .mv-btn-save {
          background: linear-gradient(90deg,#17b8ff,#32f06d);
          color: #00112b;
        }

        .mv-grid-wrap {
          overflow-x: auto;
          border-radius: 16px;
        }

        .mv-grid {
          width: 100%;
          min-width: 1150px;
          border-collapse: collapse;
        }

        .mv-grid th {
          background: #061f47;
          color: #9edfff;
          text-align: left;
          font-size: 13px;
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,.12);
        }

        .mv-grid td {
          background: rgba(6,31,71,.72);
          padding: 8px;
          border-bottom: 1px solid rgba(255,255,255,.07);
          border-right: 1px solid rgba(255,255,255,.05);
        }

        .mv-input,
        .mv-select {
          width: 100%;
          height: 42px;
          background: #0b2855;
          border: 1px solid rgba(255,255,255,.12);
          color: white;
          border-radius: 9px;
          padding: 0 10px;
          outline: none;
          box-sizing: border-box;
        }

        .mv-input::placeholder {
          color: rgba(255,255,255,.45);
        }

        .mv-select option {
          background: #061f47;
          color: white;
        }

        input[type="date"] {
          color-scheme: dark;
        }

        .mv-file {
          font-size: 12px;
        }

        .mv-remove {
          background: #ff5c70;
          color: white;
          border: none;
          border-radius: 9px;
          padding: 9px 12px;
          cursor: pointer;
          font-weight: 800;
        }

        .mv-table {
          width: 100%;
          border-collapse: collapse;
        }

        .mv-table th {
          color: #6bd8ff;
          text-align: left;
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,.08);
        }

        .mv-table td {
          padding: 12px;
          border-bottom: 1px solid rgba(255,255,255,.05);
        }

        .mv-link {
          background: #32f06d;
          color: #00112b;
          border: none;
          border-radius: 9px;
          padding: 8px 12px;
          cursor: pointer;
          font-weight: 800;
        }

        .mv-delete {
          background: #ff5c70;
          color: white;
          border: none;
          border-radius: 9px;
          padding: 8px 12px;
          cursor: pointer;
          font-weight: 800;
        }
      `}</style>

      <div className="mv-title">Movimentos</div>

      <div className="mv-subtitle">
        Lançamentos de receitas, despesas e comprovantes
      </div>

      <div className="mv-summary">
        <div className="mv-box">
          <span>Total de Crédito</span>
          <strong className="green">
            {formatarMoeda(resumo.receitas)}
          </strong>
        </div>

        <div className="mv-box">
          <span>Total de Débito</span>
          <strong className="red">
            {formatarMoeda(resumo.despesas)}
          </strong>
        </div>

        <div className="mv-box">
          <span>Saldo Atual</span>
          <strong className="blue">
            {formatarMoeda(resumo.saldo)}
          </strong>
        </div>

        <div className="mv-box">
          <span>Lançamentos</span>
          <strong>{resumo.total}</strong>
        </div>
      </div>

      <div className="mv-card">
        <div className="mv-card-header">
          <div className="mv-card-title">
            Lançamentos em Massa
          </div>

          <div className="mv-actions-top">
            <button
              type="button"
              className="mv-btn mv-btn-add"
              onClick={adicionarLinha}
            >
              + Adicionar linha
            </button>

            <button
              type="button"
              className="mv-btn mv-btn-save"
              onClick={salvarLancamentos}
            >
              Salvar Lançamentos
            </button>
          </div>
        </div>

        <div className="mv-grid-wrap">
          <table className="mv-grid">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Plano de contas</th>
                <th>Descrição / Histórico</th>
                <th>Forma Pgto.</th>
                <th>Valor</th>
                <th>Comprovante</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {linhas.map((linha, index) => (
                <tr key={index}>
                  <td>
                    <input
                      className="mv-input"
                      type="date"
                      value={linha.data}
                      onChange={(e) =>
                        atualizarLinha(index, "data", e.target.value)
                      }
                    />
                  </td>

                  <td>
                    <select
                      className="mv-select"
                      value={linha.tipo}
                      onChange={(e) =>
                        atualizarLinha(index, "tipo", e.target.value)
                      }
                    >
                      <option value="Receita">Receita</option>
                      <option value="Despesa">Despesa</option>
                    </select>
                  </td>

                  <td>
                    <select
                      className="mv-select"
                      value={linha.planoContaId}
                      onChange={(e) =>
                        atualizarLinha(index, "planoContaId", e.target.value)
                      }
                    >
                      <option value="">Selecione</option>

                      {planos.map((plano) => (
                        <option key={plano.id} value={plano.id}>
                          {plano.nome || plano.descricao || plano.conta}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <input
                      className="mv-input"
                      placeholder="Ex: Venda balcão, aluguel, energia..."
                      value={linha.descricao}
                      onChange={(e) =>
                        atualizarLinha(index, "descricao", e.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      className="mv-input"
                      placeholder="PIX, dinheiro, cartão..."
                      value={linha.formaPagamento}
                      onChange={(e) =>
                        atualizarLinha(index, "formaPagamento", e.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      className="mv-input"
                      placeholder="0,00"
                      value={linha.valor}
                      onChange={(e) =>
                        atualizarLinha(index, "valor", e.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      className="mv-input mv-file"
                      type="file"
                      onChange={(e) =>
                        atualizarLinha(index, "arquivo", e.target.files[0])
                      }
                    />
                  </td>

                  <td>
                    <button
                      type="button"
                      className="mv-remove"
                      onClick={() => removerLinha(index)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mv-card">
        <div className="mv-card-header">
          <div className="mv-card-title">
            Lançamentos Salvos
          </div>
        </div>

        <div className="mv-grid-wrap">
          <table className="mv-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Plano de contas</th>
                <th>Descrição</th>
                <th>Forma Pgto.</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Comprovante</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {movimentos.map((item) => (
                <tr key={item.id}>
                  <td>{formatarData(item.data)}</td>
                  <td>{item.tipo}</td>
                  <td>{item.planoContaNome || "-"}</td>
                  <td>{item.descricao}</td>
                  <td>{item.formaPagamento || "-"}</td>
                  <td>{formatarMoeda(item.valor)}</td>
                  <td>{item.status}</td>
                  <td>
                    {item.comprovante ? (
                      <button
                        className="mv-link"
                        onClick={() =>
                          window.open(item.comprovante, "_blank")
                        }
                      >
                        Abrir
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <button
                      className="mv-delete"
                      onClick={() => excluirMovimento(item.id)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}

              {movimentos.length === 0 && (
                <tr>
                  <td colSpan="9" style={{ opacity: .7 }}>
                    Nenhum lançamento cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
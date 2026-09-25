const { DataTypes } = require("sequelize")

async function up({ sequelize, queryInterface, transaction }) {
  const modelo = sequelize.models.UsuarioCliente
  if (!modelo) throw new Error("Modelo UsuarioCliente não registrado")

  const tabelaModelo = modelo.getTableName()
  const tabela = typeof tabelaModelo === "string" ? tabelaModelo : tabelaModelo.tableName
  const tabelas = await queryInterface.showAllTables({ transaction })
  const nomes = new Set((tabelas || []).map(item => typeof item === "string" ? item : item.tableName || item.name))

  if (!nomes.has(tabela)) {
    await queryInterface.createTable(tabela, {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      usuarioId: { type: DataTypes.INTEGER, allowNull: false },
      clienteId: { type: DataTypes.INTEGER, allowNull: false },
      principal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      escritorioId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
    }, { transaction })
  }

  const indices = await queryInterface.showIndex(tabela, { transaction })
  const nomesIndices = new Set((indices || []).map(indice => indice.name))
  if (!nomesIndices.has("uq_usuario_cliente_escritorio")) {
    await queryInterface.addIndex(tabela, ["escritorioId", "usuarioId", "clienteId"], {
      name: "uq_usuario_cliente_escritorio",
      unique: true,
      transaction,
    })
  }
  if (!nomesIndices.has("idx_usuario_cliente_ativos")) {
    await queryInterface.addIndex(tabela, ["escritorioId", "usuarioId", "ativo"], {
      name: "idx_usuario_cliente_ativos",
      transaction,
    })
  }

  await sequelize.query(`
    INSERT INTO "${tabela}" ("usuarioId", "clienteId", "principal", "ativo", "escritorioId", "createdAt", "updatedAt")
    SELECT u.id, c.id, TRUE, TRUE, u."escritorioId", NOW(), NOW()
    FROM "Usuarios" u
    JOIN "Clientes" c
      ON c.nome = u."clienteVinculado"
     AND c."escritorioId" IS NOT DISTINCT FROM u."escritorioId"
    WHERE u.perfil = 'Cliente'
      AND u."clienteVinculado" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "${tabela}" uc
        WHERE uc."usuarioId" = u.id AND uc."clienteId" = c.id
      )
  `, { transaction })

  for (const nomeModelo of ["Fiscal", "SolicitacaoCliente", "DocumentoDigital", "Declaracao"]) {
    const modeloPortal = sequelize.models[nomeModelo]
    if (!modeloPortal) throw new Error(`Modelo ${nomeModelo} não registrado`)
    const tabelaModeloPortal = modeloPortal.getTableName()
    const tabelaPortal = typeof tabelaModeloPortal === "string" ? tabelaModeloPortal : tabelaModeloPortal.tableName
    const descricao = await queryInterface.describeTable(tabelaPortal, { transaction })

    if (!descricao.clienteId) {
      await queryInterface.addColumn(tabelaPortal, "clienteId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      }, { transaction })
    }

    const indicesPortal = await queryInterface.showIndex(tabelaPortal, { transaction })
    const nomeIndice = `idx_${tabelaPortal.toLowerCase()}_escritorio_cliente`
    if (!(indicesPortal || []).some(indice => indice.name === nomeIndice)) {
      await queryInterface.addIndex(tabelaPortal, ["escritorioId", "clienteId"], {
        name: nomeIndice,
        transaction,
      })
    }

    await sequelize.query(`
      UPDATE "${tabelaPortal}" registro
      SET "clienteId" = (
        SELECT MIN(c.id)
        FROM "Clientes" c
        WHERE c.nome = registro.cliente
          AND c."escritorioId" IS NOT DISTINCT FROM registro."escritorioId"
      )
      WHERE registro."clienteId" IS NULL
        AND (
          SELECT COUNT(*)
          FROM "Clientes" c
          WHERE c.nome = registro.cliente
            AND c."escritorioId" IS NOT DISTINCT FROM registro."escritorioId"
        ) = 1
    `, { transaction })
  }
}

module.exports = { up }

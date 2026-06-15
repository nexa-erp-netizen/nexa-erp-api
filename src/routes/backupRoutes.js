const express = require("express")
const fs = require("fs")
const path = require("path")
const { exec } = require("child_process")
const { autenticar } = require("../middlewares/authMiddleware")

const router = express.Router()

function somenteAdmin(req, res, next) {
  if (req.usuario.perfil !== "Administrador") {
    return res.status(403).json({ message: "Acesso negado" })
  }

  next()
}

router.use(autenticar)
router.use(somenteAdmin)

router.post("/gerar", async (req, res) => {
  try {
    const data = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")

    const nomeArquivo = `backup-nexa-${data}.sql`

    const caminhoBackup = path.resolve(
      __dirname,
      "../../backups",
      nomeArquivo
    )

    const pgDumpPath =
      process.env.PG_DUMP_PATH || `"C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe"`

    const databaseUrl = process.env.DATABASE_URL

    const comando = databaseUrl
      ? `${pgDumpPath} "${databaseUrl}" -F p -f "${caminhoBackup}"`
      : `${pgDumpPath} -h localhost -p 5432 -U postgres -d nexa_erp -F p -f "${caminhoBackup}"`

    exec(
      comando,
      {
        env: {
          ...process.env,
          PGPASSWORD: process.env.PGPASSWORD || "Nexa123@",
        },
      },
      (error) => {
        if (error) {
          console.error("ERRO AO GERAR BACKUP:", error)

          return res.status(500).json({
            message: "Erro ao gerar backup",
          })
        }

        res.json({
          message: "Backup gerado com sucesso",
          arquivo: nomeArquivo,
        })
      }
    )
  } catch (error) {
    console.error("ERRO BACKUP:", error)

    res.status(500).json({
      message: "Erro interno ao gerar backup",
    })
  }
})

router.get("/", (req, res) => {
  const pastaBackups = path.resolve(
    __dirname,
    "../../backups"
  )

  if (!fs.existsSync(pastaBackups)) {
    fs.mkdirSync(pastaBackups)
  }

  const arquivos = fs.readdirSync(pastaBackups)

  res.json(arquivos)
})

module.exports = router

const express = require("express")
const fs = require("fs")
const path = require("path")
const { exec } = require("child_process")

const router = express.Router()

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
      `"C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe"`

    const comando =
      `${pgDumpPath} -h localhost -p 5432 -U postgres -d nexa_erp -F p -f "${caminhoBackup}"`

    exec(
      comando,
      {
        env: {
          ...process.env,
          PGPASSWORD: "Nexa123@",
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
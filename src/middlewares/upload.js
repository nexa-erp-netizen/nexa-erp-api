const multer = require("multer")
const path = require("path")
const fs = require("fs")

const uploadDir = path.resolve(__dirname, "../../uploads")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },

  filename: (req, file, cb) => {
    const nomeArquivo =
      Date.now() +
      "-" +
      file.originalname.replace(/\s+/g, "-")

    cb(null, nomeArquivo)
  },
})

const upload = multer({
  storage,
})

module.exports = upload
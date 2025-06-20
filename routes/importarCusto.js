const express = require("express");
const router = express.Router();
const pool = require("../database");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");

const upload = multer({ dest: "uploads/" });

router.post("/importar-custo", upload.single("arquivo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Arquivo não enviado" });
  }

  const filePath = path.join(__dirname, "../", req.file.path);

  try {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const client = await pool.connect();
    let atualizados = 0;

    for (let i = 1; i < data.length; i++) {
      const sku = String(data[i][0]).trim();
      const precoCusto = parseFloat(String(data[i][1]).replace(",", "."));

      if (!sku || isNaN(precoCusto)) continue;

      const update = await client.query(
        "UPDATE produtos SET precoCusto = $1 WHERE sku = $2",
        [precoCusto, sku]
      );

      if (update.rowCount > 0) atualizados++;
    }

    client.release();
    fs.unlinkSync(filePath);
    res.json({ message: `Preços de custo atualizados: ${atualizados}` });
  } catch (err) {
    fs.unlinkSync(filePath);
    console.error("Erro ao importar planilha:", err);
    res.status(500).json({ error: "Falha ao processar o arquivo" });
  }
});

module.exports = router;

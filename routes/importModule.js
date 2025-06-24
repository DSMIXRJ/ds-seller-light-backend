const express = require("express");
const router = express.Router();
const pool = require("../database");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const upload = multer({ dest: "uploads/" });

// Gerar modelo de planilha
router.get("/template", async (req, res) => {
  try {
    // Criar workbook
    const wb = xlsx.utils.book_new();
    
    // Dados da planilha com exemplos fixos
    const data = [
      ["⚠️ NÃO delete, mova ou renomeie as colunas. Apenas preencha a Coluna A (SKU) e Coluna B (Preço)."],
      ["SKU", "Preço"],
      ["EXEMPLO001", ""],
      ["EXEMPLO002", ""],
      ["EXEMPLO003", ""],
      ["", ""]
    ];

    // Criar worksheet
    const ws = xlsx.utils.aoa_to_sheet(data);
    
    // Adicionar ao workbook
    xlsx.utils.book_append_sheet(wb, ws, "Modelo");

    // Gerar buffer
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    // Configurar headers para download
    res.setHeader("Content-Disposition", "attachment; filename=modelo_importacao.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    
    res.send(buffer);
  } catch (err) {
    console.error("Erro ao gerar modelo:", err);
    res.status(500).json({ error: "Erro ao gerar modelo de planilha" });
  }
});

// Importar preços de custo
router.post("/cost-price", upload.single("arquivo"), async (req, res) => {
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
    const updates = [];

    for (let i = 1; i < data.length; i++) {
      const linha = data[i];
      if (!linha || linha.length < 2) continue;

      const skuRaw = linha[0];
      const precoRaw = linha[1];
      
      // Ignorar linhas de instrução ou inválidas
      if (!skuRaw || !precoRaw || 
          typeof precoRaw === "string" && precoRaw.toLowerCase().includes("preco") ||
          typeof skuRaw === "string" && skuRaw.includes("⚠️")) continue;

      const sku = String(skuRaw).trim();
      const precoCusto = parseFloat(String(precoRaw).replace(",", "."));
      if (!sku || isNaN(precoCusto)) continue;

      const update = await client.query(
        "UPDATE produtos SET precoCusto = $1 WHERE sku = $2",
        [precoCusto, sku]
      );

      if (update.rowCount > 0) {
        atualizados++;
        updates.push({ sku, precoCusto });
      }
    }

    client.release();
    fs.unlinkSync(filePath);
    
    res.json({ 
      message: `Preços de custo atualizados: ${atualizados}`,
      updates: updates
    });
  } catch (err) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error("Erro ao importar planilha:", err);
    res.status(500).json({ error: "Falha ao processar o arquivo" });
  }
});

// Importar preços de venda
router.post("/sale-price", upload.single("arquivo"), async (req, res) => {
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
    const updates = [];

    for (let i = 1; i < data.length; i++) {
      const linha = data[i];
      if (!linha || linha.length < 2) continue;

      const skuRaw = linha[0];
      const precoRaw = linha[1];
      
      // Ignorar linhas de instrução ou inválidas
      if (!skuRaw || !precoRaw || 
          typeof precoRaw === "string" && precoRaw.toLowerCase().includes("preco") ||
          typeof skuRaw === "string" && skuRaw.includes("⚠️")) continue;

      const sku = String(skuRaw).trim();
      const precoVenda = parseFloat(String(precoRaw).replace(",", "."));
      if (!sku || isNaN(precoVenda)) continue;

      const update = await client.query(
        "UPDATE produtos SET precoVenda = $1 WHERE sku = $2",
        [precoVenda, sku]
      );

      if (update.rowCount > 0) {
        atualizados++;
        updates.push({ sku, precoVenda });
      }
    }

    client.release();
    fs.unlinkSync(filePath);
    
    res.json({ 
      message: `Preços de venda atualizados: ${atualizados}`,
      updates: updates
    });
  } catch (err) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error("Erro ao importar planilha:", err);
    res.status(500).json({ error: "Falha ao processar o arquivo" });
  }
});

// Enviar atualizações de preço de custo para Mercado Livre
router.post("/send-cost-updates", async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: "Lista de atualizações não fornecida" });
    }

    // Buscar token do Mercado Livre
    const client = await pool.connect();
    const tokenResult = await client.query(
      "SELECT access_token FROM tokens WHERE marketplace = 'mercadolivre' ORDER BY obtained_at DESC LIMIT 1"
    );
    
    if (tokenResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: "Token do Mercado Livre não encontrado" });
    }

    const token = tokenResult.rows[0].access_token;
    let sucessos = 0;
    let erros = 0;

    for (const update of updates) {
      try {
        // Buscar item por SKU no banco local
        const itemResult = await client.query(
          "SELECT ml_item_id FROM produtos WHERE sku = $1",
          [update.sku]
        );

        if (itemResult.rows.length === 0) {
          erros++;
          continue;
        }

        const itemId = itemResult.rows[0].ml_item_id;
        
        // Atualizar no Mercado Livre (aqui seria a lógica específica para custo)
        // Como o ML não tem endpoint direto para custo, atualizamos no banco local
        await client.query(
          "UPDATE produtos SET precoCusto = $1 WHERE sku = $2",
          [update.precoCusto, update.sku]
        );
        
        sucessos++;
      } catch (err) {
        console.error(`Erro ao atualizar SKU ${update.sku}:`, err);
        erros++;
      }
    }

    client.release();
    
    res.json({
      message: `Atualizações enviadas: ${sucessos} sucessos, ${erros} erros`,
      sucessos,
      erros
    });
  } catch (err) {
    console.error("Erro ao enviar atualizações:", err);
    res.status(500).json({ error: "Erro ao enviar atualizações" });
  }
});

// Enviar atualizações de preço de venda para Mercado Livre
router.post("/send-price-updates", async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: "Lista de atualizações não fornecida" });
    }

    // Buscar token do Mercado Livre
    const client = await pool.connect();
    const tokenResult = await client.query(
      "SELECT access_token FROM tokens WHERE marketplace = 'mercadolivre' ORDER BY obtained_at DESC LIMIT 1"
    );
    
    if (tokenResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: "Token do Mercado Livre não encontrado" });
    }

    const token = tokenResult.rows[0].access_token;
    let sucessos = 0;
    let erros = 0;

    for (const update of updates) {
      try {
        // Buscar item por SKU no banco local
        const itemResult = await client.query(
          "SELECT ml_item_id FROM produtos WHERE sku = $1",
          [update.sku]
        );

        if (itemResult.rows.length === 0) {
          erros++;
          continue;
        }

        const itemId = itemResult.rows[0].ml_item_id;
        
        // Atualizar preço no Mercado Livre
        await axios.put(
          `https://api.mercadolibre.com/items/${itemId}`,
          { price: update.precoVenda },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // Atualizar no banco local
        await client.query(
          "UPDATE produtos SET precoVenda = $1 WHERE sku = $2",
          [update.precoVenda, update.sku]
        );
        
        sucessos++;
      } catch (err) {
        console.error(`Erro ao atualizar SKU ${update.sku}:`, err);
        erros++;
      }
    }

    client.release();
    
    res.json({
      message: `Atualizações enviadas: ${sucessos} sucessos, ${erros} erros`,
      sucessos,
      erros
    });
  } catch (err) {
    console.error("Erro ao enviar atualizações:", err);
    res.status(500).json({ error: "Erro ao enviar atualizações" });
  }
});

module.exports = router;


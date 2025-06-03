// routes/anuncios.js

const express = require("express");
const axios = require("axios");
const pool = require("../database");

const router = express.Router();

router.get("/ml", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT access_token FROM tokens WHERE plataforma = 'mercadolivre' ORDER BY id DESC LIMIT 1");
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Token de acesso não encontrado." });
    }

    const accessToken = result.rows[0].access_token;

    // Requisição para buscar os anúncios ativos do vendedor
    const response = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const userId = response.data.id;

    const itemsResponse = await axios.get(
      `https://api.mercadolibre.com/users/${userId}/items/search?status=active`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return res.json({ anuncios: itemsResponse.data.results });
  } catch (error) {
    console.error("[ANUNCIOS_LOG] Erro ao buscar anúncios:", error.message);
    return res.status(500).json({ error: "Erro ao buscar anúncios." });
  }
});

module.exports = router;

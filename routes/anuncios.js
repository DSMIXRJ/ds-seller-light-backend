const express = require("express");
const router = express.Router();
const pool = require("../database");
const axios = require("axios");

router.get("/ml", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT * FROM tokens WHERE marketplace = 'mercadolivre' ORDER BY obtained_at DESC LIMIT 1");
    client.release();

    if (result.rows.length === 0) {
      console.error("[ANUNCIOS_LOG] Token não encontrado.");
      return res.status(404).json({ error: "Token não encontrado" });
    }

    const token = result.rows[0].access_token;

    const userInfo = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const userId = userInfo.data.id;

    const itemsResponse = await axios.get(
      `https://api.mercadolibre.com/users/${userId}/items/search?status=active`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const itemIds = itemsResponse.data.results;

    if (itemIds.length === 0) {
      console.log("[ANUNCIOS_LOG] Nenhum anúncio ativo encontrado.");
      return res.json({ anuncios: [] });
    }

    const itemsDetails = await Promise.all(
      itemIds.map(async (itemId) => {
        try {
          const { data } = await axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          return {
            id: data.id,
            title: data.title,
            image: data.thumbnail,
            sku: data.seller_custom_field || "-",
            estoque: data.available_quantity || 0,
            visitas: 0,
            vendas: data.sold_quantity || 0,
            price: data.price,
            permalink: data.permalink,
            status: data.status,
            precoVenda: data.price,
            precoCusto: 0,
            totalCostML: 0,
          };
        } catch (err) {
          console.error(`[ANUNCIOS_LOG] Erro no item ${itemId}:`, err.message);
          return null;
        }
      })
    );

    const validItems = itemsDetails.filter(item => item !== null);
    res.json({ anuncios: validItems });
  } catch (error) {
    console.error("[ANUNCIOS_LOG] Erro geral:", error.message);
    res.status(500).json({ error: "Erro ao buscar anúncios" });
  }
});

module.exports = router;


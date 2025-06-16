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
      return res.json({ anuncios: [] });
    }

    const itemsDetails = await Promise.all(
      itemIds.map(async (itemId) => {
        const itemDetail = await axios.get(
          `https://api.mercadolibre.com/items/${itemId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const itemData = itemDetail.data;

        // Verificação manual para garantir leitura do SKU (seller_custom_field) corretamente
        const sku = itemData.seller_custom_field && itemData.seller_custom_field.trim() !== '' 
          ? itemData.seller_custom_field 
          : '-';

        return {
          id: itemData.id,
          title: itemData.title,
          image: itemData.thumbnail,
          sku: sku,
          estoque: itemData.available_quantity || 0,
          visitas: itemData.initial_quantity 
            ? itemData.initial_quantity - itemData.available_quantity 
            : 0,
          vendas: itemData.sold_quantity || 0,
          price: itemData.price,
          permalink: itemData.permalink,
          status: itemData.status,
          precoVenda: itemData.price,
          precoCusto: 0,
          totalCostML: 0,
        };
      })
    );

    res.json({ anuncios: itemsDetails });
  } catch (error) {
    console.error("[ANUNCIOS_LOG] Erro ao buscar anúncios:", error.message);
    res.status(500).json({ error: "Erro ao buscar anúncios" });
  }
});

module.exports = router;

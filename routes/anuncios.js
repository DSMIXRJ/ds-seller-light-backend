const express = require("express");
const router = express.Router();
const pool = require("../database");
const axios = require("axios");

router.get("/ml", async (_req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT * FROM tokens WHERE marketplace = 'mercadolivre' ORDER BY obtained_at DESC LIMIT 1"
    );
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Token não encontrado" });
    }

    const token = result.rows[0].access_token;

    const userInfo = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const userId = userInfo.data.id;
    const limit = 50;
    let offset = 0;
    let itemIds = [];

    while (true) {
      const response = await axios.get(
        `https://api.mercadolibre.com/users/${userId}/items/search?status=active&offset=${offset}&limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const pageItems = response.data.results;
      if (pageItems.length === 0) break;

      itemIds.push(...pageItems);
      offset += limit;
    }

    if (itemIds.length === 0) {
      return res.json({ anuncios: [] });
    }

    const visitasMap = {};

    for (let i = 0; i < itemIds.length; i += 50) {
      const bloco = itemIds.slice(i, i + 50);
      try {
        const visitasRes = await axios.get(
          `https://api.mercadolibre.com/items/visits?ids=${bloco.join(",")}&last=30&unit=day`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        visitasRes.data.forEach(entry => {
          visitasMap[entry.item_id] = entry.total_visits ?? "-";
        });
      } catch (err) {
        console.warn(`[VISITAS_LOG] Falha ao buscar visitas no bloco ${i}-${i + 49}`);
      }
    }

    const itemsDetails = await Promise.all(
      itemIds.map(async (itemId) => {
        try {
          const { data: itemData } = await axios.get(
            `https://api.mercadolibre.com/items/${itemId}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          const sku = itemData.seller_custom_field && itemData.seller_custom_field.trim()
            ? itemData.seller_custom_field
            : (
              itemData.attributes.find(a =>
                a.id === "SELLER_SKU" ||
                a.id === "SKU" ||
                a.id === "SELLER_CUSTOM_FIELD"
              )?.value_name || "-"
            );

          return {
            id: itemData.id,
            title: itemData.title,
            image: itemData.thumbnail,
            sku: sku,
            estoque: itemData.available_quantity || 0,
            visitas: visitasMap[itemId] ?? "-",
            vendas: itemData.sold_quantity || 0,
            price: itemData.price,
            permalink: itemData.permalink,
            status: itemData.status,
            precoVenda: itemData.price,
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
    console.error("[ANUNCIOS_LOG] Erro ao buscar anúncios:", error.message);
    res.status(500).json({ error: "Erro ao buscar anúncios" });
  }
});

module.exports = router;


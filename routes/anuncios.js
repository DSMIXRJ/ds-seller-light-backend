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
    const anuncioId = "MLB5292144812"; // ID fixo para teste

    const itemRes = await axios.get(`https://api.mercadolibre.com/items/${anuncioId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const visitasRes = await axios.get(
      `https://api.mercadolibre.com/visits/items?ids=${anuncioId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const itemData = itemRes.data;
    const visitas = visitasRes.data[anuncioId] ?? "-";

    const sku = itemData.seller_custom_field && itemData.seller_custom_field.trim()
      ? itemData.seller_custom_field
      : (
        itemData.attributes.find(a =>
          a.id === "SELLER_SKU" ||
          a.id === "SKU" ||
          a.id === "SELLER_CUSTOM_FIELD"
        )?.value_name || "-"
      );

    const anuncioFormatado = {
      id: itemData.id,
      title: itemData.title,
      image: itemData.thumbnail,
      sku: sku,
      estoque: itemData.available_quantity || 0,
      visitas: visitas,
      vendas: itemData.sold_quantity || 0,
      price: itemData.price,
      permalink: itemData.permalink,
      status: itemData.status,
      precoVenda: itemData.price,
      precoCusto: 0,
      totalCostML: 0,
    };

    res.json({ anuncios: [anuncioFormatado] });
  } catch (error) {
    console.error("[ANUNCIOS_LOG] Erro ao buscar anúncio:", error.message);
    res.status(500).json({ error: "Erro ao buscar anúncio" });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js");
const fs = require("fs").promises;
const path = require("path");

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";
const ML_CONFIG_FILE = path.join(__dirname, "..", "mlConfig.json");

// Função auxiliar para renovar ou validar token
async function getValidAccessToken(userId, marketplace) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT access_token, refresh_token, expires_in, obtained_at FROM tokens WHERE user_id = $1 AND marketplace = $2",
      [userId, marketplace]
    );
    if (result.rows.length === 0) return null;

    const { access_token, refresh_token, expires_in, obtained_at } = result.rows[0];
    const now = Date.now();
    const expiresAt = obtained_at + expires_in * 1000;

    if (now < expiresAt - 60000) return access_token;

    const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token,
    });

    const { access_token: newToken, refresh_token: newRefresh, expires_in: newExpires } = response.data;

    await client.query(
      `UPDATE tokens SET access_token = $1, refresh_token = $2, expires_in = $3, obtained_at = $4
       WHERE user_id = $5 AND marketplace = $6`,
      [newToken, newRefresh, newExpires, now, userId, marketplace]
    );

    return newToken;
  } catch (error) {
    console.error("Erro ao renovar token:", error.message);
    return null;
  } finally {
    client.release();
  }
}

const readMlConfig = async () => {
  try {
    const data = await fs.readFile(ML_CONFIG_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { margemMinima: "", margemMaxima: "", imposto: "", extras: "" };
    }
    console.error("Erro ao ler mlConfig.json:", error);
    return { margemMinima: "", margemMaxima: "", imposto: "", extras: "" };
  }
};

const writeMlConfig = async (config) => {
  try {
    await fs.writeFile(ML_CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch (error) {
    console.error("Erro ao escrever mlConfig.json:", error);
  }
};

router.get("/config", async (req, res) => {
  try {
    const config = await readMlConfig();
    res.json(config);
  } catch (error) {
    console.error("Erro ao ler configuração ML:", error.message);
    res.status(500).json({ message: "Erro ao carregar configuração do Mercado Livre", error: error.message });
  }
});

router.post("/config", async (req, res) => {
  try {
    await writeMlConfig(req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erro ao salvar configuração" });
  }
});

router.get("/status", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";
  const token = await getValidAccessToken(userId, marketplace);
  res.json({ integrated: !!token });
});

router.delete("/remove", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM tokens WHERE user_id = $1 AND marketplace = $2", [userId, marketplace]);
    console.log("[BACKEND] Integração removida do DS Seller.");
    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao remover integração:", error.message);
    res.status(500).json({ success: false, message: "Erro ao remover integração", error: error.message });
  } finally {
    client.release();
  }
});

router.get("/items", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";
  const accessToken = await getValidAccessToken(userId, marketplace);

  if (!accessToken) {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }

  try {
    const response = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const sellerId = response.data.id;

    const itemsResponse = await axios.get(
      `https://api.mercadolibre.com/users/${sellerId}/items/search?search_type=scan`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const items = itemsResponse.data.results.slice(0, 50);
    const itemsDetails = await Promise.all(
      items.map(async (id) => {
        const itemRes = await axios.get(`https://api.mercadolibre.com/items/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        return {
          id: itemRes.data.id,
          title: itemRes.data.title,
          price: itemRes.data.price,
          sku: itemRes.data.seller_custom_field || "",
          sold_quantity: itemRes.data.sold_quantity || 0,
          available_quantity: itemRes.data.available_quantity || 0,
          visits: 0,
        };
      })
    );

    res.json(itemsDetails);
  } catch (error) {
    console.error("Erro ao buscar anúncios:", error.message);
    res.status(500).json({ message: "Erro ao buscar anúncios" });
  }
});

module.exports = router;

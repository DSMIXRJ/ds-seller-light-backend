const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js");

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

const getTokensFromDB = async (userId, marketplace) => {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT access_token, refresh_token, obtained_at, expires_in FROM tokens WHERE user_id = $1 AND marketplace = $2",
      [userId, marketplace]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
};

const saveTokensToDB = async (userId, marketplace, accessToken, refreshToken, expiresIn) => {
  const obtainedAt = Date.now();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO tokens (user_id, marketplace, access_token, refresh_token, expires_in, obtained_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, marketplace) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_in = EXCLUDED.expires_in,
         obtained_at = EXCLUDED.obtained_at`,
      [userId, marketplace, accessToken, refreshToken, expiresIn, obtainedAt]
    );
  } finally {
    client.release();
  }
};

router.get("/auth-url", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.json({ authUrl });
});

router.get("/exchange-code-get", async (req, res) => {
  const { code } = req.query;
  const userId = "default_user";
  const marketplace = "mercadolivre";

  if (!code) return res.status(400).json({ message: "Authorization code is required" });

  try {
    const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    });

    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    res.json({ message: "Token stored successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error exchanging code", error: error.message });
  }
});

router.post("/exchange-code", async (req, res) => {
  const { code } = req.body;
  const userId = "default_user";
  const marketplace = "mercadolivre";

  if (!code) return res.status(400).json({ message: "Authorization code is required" });

  try {
    const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    });

    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    res.json({ message: "Token stored successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error exchanging code", error: error.message });
  }
});

const getValidAccessToken = async (userId, marketplace) => {
  const tokenData = await getTokensFromDB(userId, marketplace);
  if (!tokenData) throw new Error("No tokens found. Please authenticate.");

  const expirationTime = Number(tokenData.obtained_at) + tokenData.expires_in * 1000;
  if (Date.now() >= expirationTime - 5 * 60 * 1000) {
    const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokenData.refresh_token,
    });

    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    return access_token;
  }

  return tokenData.access_token;
};

router.get("/user-info", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const response = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Error fetching user info", error: error.message });
  }
});

router.get("/items", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const userInfo = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const sellerId = userInfo.data.id;
    const itemList = await axios.get(`https://api.mercadolibre.com/users/${sellerId}/items/search`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 50, offset: 0 },
    });

    const itemIds = itemList.data.results;

    const itemDetails = await Promise.all(
      itemIds.map(id =>
        axios.get(`https://api.mercadolibre.com/items/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      )
    );

    const visitStats = await Promise.all(
      itemIds.map(id =>
        axios
          .get(`https://api.mercadolibre.com/items/${id}/visits/time_window?last=30&unit=day`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          .catch(() => ({ data: { total_visits: 0 } }))
      )
    );

    const formatted = itemDetails.map((res, i) => {
      const item = res.data;
      const precoVenda = item.price;
      const precoCusto = precoVenda * 0.6;
      const margem = precoVenda - precoCusto;

      return {
        id: item.id,
        sku: item.seller_custom_field || "—",
        image: item.thumbnail,
        estoque: item.available_quantity,
        title: item.title,
        precoVenda,
        precoCusto,
        margemPercentual: Math.round((margem / precoCusto) * 100),
        margemReais: margem.toFixed(2),
        lucroTotal: (margem * item.sold_quantity).toFixed(2),
        visitas: visitStats[i]?.data?.total_visits || 0,
        vendas: item.sold_quantity,
        promocao: item.official_store_id !== null,
        permalink: item.permalink,
        status: item.status,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error("Erro:", error.message);
    res.status(500).json({ message: "Erro ao buscar anúncios", error: error.message });
  }
});

module.exports = router;

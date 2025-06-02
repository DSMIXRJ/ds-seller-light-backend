const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js"); // Path to database.js (PostgreSQL pool)

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

// Helper function to get tokens from DB
const getTokensFromDB = async (userId, marketplace) => {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT access_token, refresh_token, obtained_at, expires_in FROM tokens WHERE user_id = $1 AND marketplace = $2", [userId, marketplace]);
    return res.rows[0];
  } finally {
    client.release();
  }
};

// Helper function to save tokens to DB
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

  if (!code) {
    return res.status(400).json({ message: "Authorization code is required as query parameter" });
  }

  try {
    const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI,
    }, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
    });

    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);

    res.json({ message: "Token obtained and stored successfully in PostgreSQL DB!" });
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Error exchanging code for token", error: error.response ? error.response.data : error.message });
  }
});

router.post("/exchange-code", async (req, res) => {
  const { code } = req.body;
  const userId = "default_user";
  const marketplace = "mercadolivre";

  if (!code) {
    return res.status(400).json({ message: "Authorization code is required" });
  }

  try {
    const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI,
    }, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
    });

    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);

    res.json({ message: "Token obtained and stored successfully in PostgreSQL DB!" });
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Error exchanging code for token", error: error.response ? error.response.data : error.message });
  }
});

const getValidAccessToken = async (userId, marketplace) => {
  let tokenData = await getTokensFromDB(userId, marketplace);

  if (!tokenData) {
    throw new Error("No tokens found for this user and marketplace. Please authenticate.");
  }

  const currentTime = Date.now();
  const expirationTime = Number(tokenData.obtained_at) + (tokenData.expires_in * 1000);

  if (currentTime >= expirationTime - (5 * 60 * 1000)) {
    console.log("Access token expired or about to expire, refreshing...");
    try {
      const refreshResponse = await axios.post("https://api.mercadolibre.com/oauth/token", {
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
      }, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
      });
      const { access_token, refresh_token, expires_in } = refreshResponse.data;
      await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
      console.log("Token refreshed and saved to PostgreSQL DB.");
      return access_token;
    } catch (refreshError) {
      console.error("Error refreshing token:", refreshError.response ? refreshError.response.data : refreshError.message);
      throw new Error("Failed to refresh token. Please re-authenticate.");
    }
  }
  return tokenData.access_token;
};

router.get("/user-info", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const userInfoResponse = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(userInfoResponse.data);
  } catch (error) {
    console.error("Error fetching user info:", error.message);
    res.status(500).json({ message: "Error fetching user info", error: error.message });
  }
});

router.get("/items", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);

    const userInfoResponse = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const sellerId = userInfoResponse.data.id;

    const itemsResponse = await axios.get(`https://api.mercadolibre.com/users/${sellerId}/items/search`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        limit: 50,
        offset: 0,
      },
    });

    const itemIds = itemsResponse.data.results;
    const itemDetailsPromises = itemIds.map(itemId =>
      axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    );

    const itemsWithDetails = await Promise.all(itemDetailsPromises);
    const itemsData = itemsWithDetails.map(response => response.data);

    const visitStatsPromises = itemIds.map(itemId =>
      axios.get(`https://api.mercadolibre.com/items/${itemId}/visits/time_window?last=30&unit=day`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }).catch(err => ({ data: { total_visits: 0 } }))
    );

    const visitStats = await Promise.all(visitStatsPromises);

    const formattedItems = itemsData.map((item, index) => {
      const precoVenda = item.price;
      const precoCusto = item.price * 0.6;
      const margemReais = precoVenda - precoCusto;
      const margemPercentual = Math.round((margemReais / precoCusto) * 100);

      return {
        id: item.id,
        image: item.thumbnail,
        estoque: item.available_quantity,
        title: item.title,
        precoVenda: precoVenda,
        precoCusto: precoCusto,
        margemPercentual: margemPercentual,
        margemReais: margemReais.toFixed(2),
        lucroTotal: (margemReais * item.sold_quantity).toFixed(2),
        visitas: visitStats[index]?.data?.total_visits || 0,
        vendas: item.sold_quantity,
        promocao: item.official_store_id !== null,
        permalink: item.permalink,
        status: item.status,
      };
    });

    res.json(formattedItems);
  } catch (error) {
    console.error("Erro ao buscar anúncios:", error.message);
    res.status(500).json({
      message: "Erro ao buscar anúncios",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 🔄 Redirecionamento após login com Mercado Livre
router.get("/auth/callback", (req, res) => {
  res.redirect("https://dsseller.com.br/integracoes");
});

module.exports = router;

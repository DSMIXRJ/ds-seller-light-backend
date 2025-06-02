const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js"); // Path to database.js (PostgreSQL pool)

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

// Sempre usar este userId para salvar e buscar tokens:
const userId = "1"; // Use "1" para ambiente sem login, garantindo consistência
const marketplace = "mercadolivre";

// Helper function to get tokens from DB
const getTokensFromDB = async () => {
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

// Helper function to save tokens to DB
const saveTokensToDB = async (accessToken, refreshToken, expiresIn) => {
  const obtainedAt = Date.now(); // Store as milliseconds
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

// Helper function to remove tokens from DB
const removeTokensFromDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(
      "DELETE FROM tokens WHERE user_id = $1 AND marketplace = $2",
      [userId, marketplace]
    );
  } finally {
    client.release();
  }
};

router.get("/auth-url", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.json({ authUrl });
});

// Troca código por token e salva (GET)
router.get("/exchange-code-get", async (req, res) => {
  const { code } = req.query;
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
    await saveTokensToDB(access_token, refresh_token, expires_in);
    res.json({ message: "Token obtained and stored successfully in PostgreSQL DB!" });
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Error exchanging code for token", error: error.response ? error.response.data : error.message });
  }
});

// Troca código por token e salva (POST)
router.post("/exchange-code", async (req, res) => {
  const { code } = req.body;
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
    await saveTokensToDB(access_token, refresh_token, expires_in);
    res.json({ message: "Token obtained and stored successfully in PostgreSQL DB!" });
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Error exchanging code for token", error: error.response ? error.response.data : error.message });
  }
};

// Função para obter access token válido
const getValidAccessToken = async () => {
  let tokenData = await getTokensFromDB();
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
      await saveTokensToDB(access_token, refresh_token, expires_in);
      return access_token;
    } catch (refreshError) {
      console.error("Error refreshing token:", refreshError.response ? refreshError.response.data : refreshError.message);
      throw new Error("Failed to refresh token. Please re-authenticate.");
    }
  }
  return tokenData.access_token;
};

// Verifica status de integração
router.get("/integration-status", async (req, res) => {
  try {
    const tokenData = await getTokensFromDB();
    if (!tokenData) return res.json({ integrated: false });

    try {
      const accessToken = await getValidAccessToken();
      await axios.get("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return res.json({ integrated: true });
    } catch {
      await removeTokensFromDB();
      return res.json({ integrated: false });
    }
  } catch (error) {
    console.error("Erro ao checar status de integração:", error.message);
    return res.status(500).json({ integrated: false });
  }
});

// Remove integração
router.delete("/remove-integration", async (req, res) => {
  try {
    await removeTokensFromDB();
    return res.json({ success: true });
  } catch (error) {
    console.error("Erro ao remover integração:", error.message);
    return res.status(500).json({ success: false });
  }
});

// Busca anúncios reais do Mercado Livre
router.get("/items", async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();

    const userInfoResp = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const sellerId = userInfoResp.data.id;

    const itemsResp = await axios.get(
      `https://api.mercadolibre.com/users/${sellerId}/items/search`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const itemIds = itemsResp.data.results;
    if (!itemIds || itemIds.length === 0) return res.json([]);

    const detailPromises = itemIds.map((id) =>
      axios.get(`https://api.mercadolibre.com/items/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );
    const details = await Promise.all(detailPromises);

    const visitPromises = itemIds.map((id) =>
      axios
        .get(`https://api.mercadolibre.com/items/${id}/visits/time_window?last=30&unit=day`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .catch(() => ({ data: { total_visits: 0 } }))
    );
    const visits = await Promise.all(visitPromises);

    const formatted = details.map((resp, idx) => {
      const item = resp.data;
      const precoVenda = item.price;
      const precoCusto = item.price * 0.6;
      const margemReais = precoVenda - precoCusto;
      const margemPercentual = Math.round((margemReais / precoCusto) * 100);

      return {
        id: item.id,
        image: item.thumbnail,
        estoque: item.available_quantity,
        title: item.title,
        precoVenda,
        precoCusto,
        margemPercentual,
        margemReais: margemReais.toFixed(2),
        lucroTotal: (margemReais * item.sold_quantity).toFixed(2),
        visitas: visits[idx].data.total_visits || 0,
        vendas: item.sold_quantity,
        promocao: item.official_store_id !== null,
        permalink: item.permalink,
        status: item.status,
      };
    });

    return res.json(formatted);
  } catch (error) {
    console.error("Erro ao buscar anúncios:", error.message);
    // Retornar mock em caso de falha
    return res.status(200).json([
      {
        id: "MOCK_ID_1",
        image: "https://via.placeholder.com/64",
        estoque: 13,
        title: "Produto Simulado (Erro ao buscar anúncios reais)",
        precoVenda: 199.99,
        precoCusto: 100.0,
        margemPercentual: 50,
        margemReais: "99.99",
        lucroTotal: "1599.92",
        visitas: 200,
        vendas: 8,
        promocao: true,
        permalink: "#",
        status: "active",
      },
    ]);
  }
});

// Pega informações do usuário (opcional)
router.get("/user-info", async (req, res) => {
  try {
    const accessToken = await getValidAccessToken();
    const userInfoResp = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.json(userInfoResp.data);
  } catch (error) {
    console.error("Erro ao buscar informações do usuário:", error.message);
    return res.status(500).json({ message: "Erro ao buscar informações do usuário." });
  }
});

module.exports = router;

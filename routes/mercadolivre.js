const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js"); // Conexão com PostgreSQL

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

// Função auxiliar para buscar tokens no banco
const getTokensFromDB = async (userId, marketplace) => {
  try {
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
  } catch (error) {
    console.error("Erro ao obter tokens do DB:", error);
    return null;
  }
};

// Função auxiliar para salvar tokens no banco
const saveTokensToDB = async (userId, marketplace, accessToken, refreshToken, expiresIn) => {
  try {
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
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Erro ao salvar tokens no DB:", error);
    return false;
  }
};

// Função auxiliar para remover tokens do banco
const removeTokensFromDB = async (userId, marketplace) => {
  try {
    const client = await pool.connect();
    try {
      await client.query(
        "DELETE FROM tokens WHERE user_id = $1 AND marketplace = $2",
        [userId, marketplace]
      );
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Erro ao remover tokens do DB:", error);
    return false;
  }
};

// Função para trocar código por token e salvar
const exchangeCodeForToken = async (code) => {
  const response = await axios.post(
    "https://api.mercadolibre.com/oauth/token",
    null,
    {
      params: {
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI,
      },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  return response.data; // { access_token, refresh_token, expires_in, ... }
};

// Função para obter um access token válido (faz refresh se necessário)
const getValidAccessToken = async (userId, marketplace) => {
  const tokenData = await getTokensFromDB(userId, marketplace);
  if (!tokenData) throw new Error("No tokens found. Authenticate first.");

  const currentTime = Date.now();
  const expirationTime = Number(tokenData.obtained_at) + tokenData.expires_in * 1000;

  // Se faltam menos de 5 minutos para expirar, faz refresh
  if (currentTime >= expirationTime - 5 * 60 * 1000) {
    const refreshResponse = await axios.post(
      "https://api.mercadolibre.com/oauth/token",
      null,
      {
        params: {
          grant_type: "refresh_token",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    const { access_token, refresh_token, expires_in } = refreshResponse.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    return access_token;
  }

  return tokenData.access_token;
};

// Rota para iniciar fluxo de OAuth (redireciona para Mercado Livre)
router.get("/auth/meli", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  return res.redirect(authUrl);
});

// Callback do Mercado Livre (recebe ?code=XYZ)
router.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Código de autorização ausente.");

  try {
    const tokenData = await exchangeCodeForToken(code);
    const { access_token, refresh_token, expires_in } = tokenData;
    const userId = "default_user";
    const marketplace = "mercadolivre";

    const saved = await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    if (!saved) throw new Error("Falha ao salvar tokens no banco.");

    // AQUI ESTÁ O REDIRECIONAMENTO CORRIGIDO
    return res.redirect("https://dsseller.com.br/integracoes?ml_integrado=1");
  } catch (err) {
    console.error("Erro no callback OAuth ML:", err.response?.data || err.message);
    return res.status(500).send("Falha ao obter token do Mercado Livre.");
  }
});

// Rota para verificar status de integração
router.get("/integration-status", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const tokenData = await getTokensFromDB(userId, marketplace);
    if (!tokenData) return res.json({ integrated: false });

    try {
      const accessToken = await getValidAccessToken(userId, marketplace);
      await axios.get("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return res.json({ integrated: true });
    } catch {
      await removeTokensFromDB(userId, marketplace);
      return res.json({ integrated: false });
    }
  } catch (error) {
    console.error("Erro ao checar status de integração:", error.message);
    return res.status(500).json({ integrated: false });
  }
});

// Rota para remover integração
router.delete("/remove-integration", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const removed = await removeTokensFromDB(userId, marketplace);
    if (removed) return res.json({ success: true });
    throw new Error("Falha ao remover integração.");
  } catch (error) {
    console.error("Erro ao remover integração:", error.message);
    return res.status(500).json({ success: false });
  }
});

// Rota para buscar anúncios reais do Mercado Livre
router.get("/items", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);

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
    if (
      error.response?.status === 401 ||
      error.message.includes("Authenticate")
    ) {
      await removeTokensFromDB("default_user", "mercadolivre");
    }

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

// Rota para obter informações do usuário (opcional)
router.get("/user-info", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const userInfoResp = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.json(userInfoResp.data);
  } catch (error) {
    console.error("Erro ao buscar informações do usuário:", error.message);
    if (
      error.response?.status === 401 ||
      error.message.includes("Authenticate")
    ) {
      await removeTokensFromDB(userId, marketplace);
    }
    return res.status(500).json({ message: "Erro ao buscar informações do usuário." });
  }
});

module.exports = router;

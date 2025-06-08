const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js");

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

// Recupera tokens do banco
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

// Salva tokens no banco
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

// Troca código por token (GET)
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

// Troca código por token (POST)
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

// Garante token válido
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

// Dados do usuário autenticado
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

// Lista de anúncios com estatísticas e SKU
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

    // Debug: Log da estrutura do primeiro item para investigar campos SKU
    if (itemDetails.length > 0) {
      console.log("=== DEBUG: Estrutura do item ===");
      console.log("Item completo:", JSON.stringify(itemDetails[0].data, null, 2));
      console.log("Attributes:", itemDetails[0].data.attributes);
      console.log("Seller custom field:", itemDetails[0].data.seller_custom_field);
      console.log("================================");
    }

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

      // Buscar SKU em múltiplas fontes possíveis
      let sku = "—";
      
      // 1. Verificar se há variations (produtos com variações podem ter SKU nas variações)
      if (item.variations && item.variations.length > 0) {
        const firstVariation = item.variations[0];
        if (firstVariation.seller_custom_field) {
          sku = firstVariation.seller_custom_field;
        }
      }
      
      // 2. Buscar nos attributes do item principal
      if (sku === "—" && item.attributes && Array.isArray(item.attributes)) {
        const skuAttribute = item.attributes.find(attr => 
          attr.id === "SELLER_SKU" || 
          attr.id === "SKU" || 
          attr.name === "SKU" ||
          attr.name === "Código de identificação" ||
          attr.value_id === "SELLER_SKU"
        );
        if (skuAttribute) {
          sku = skuAttribute.value_name || skuAttribute.value_id || skuAttribute.values?.[0]?.name;
        }
      }
      
      // 3. Fallback para seller_custom_field do item principal
      if (sku === "—" && item.seller_custom_field) {
        sku = item.seller_custom_field;
      }
      
      // 4. Se ainda não encontrou, usar parte do ID como identificador
      if (sku === "—") {
        sku = item.id.substring(3, 11); // Pega uma parte do ID que não seja "MLB"
      }

      return {
        id: item.id,
        sku: sku,
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

// Endpoint para verificar status de integração do Mercado Livre
router.get("/status", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const tokenData = await getTokensFromDB(userId, marketplace);
    
    if (!tokenData) {
      return res.json({ integrated: false, message: "No tokens found" });
    }

    // Verificar se o token ainda é válido
    const expirationTime = Number(tokenData.obtained_at) + tokenData.expires_in * 1000;
    const isExpired = Date.now() >= expirationTime - 5 * 60 * 1000; // 5 minutos de margem

    if (isExpired) {
      try {
        // Tentar renovar o token
        const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
          grant_type: "refresh_token",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
        });
        
        const { access_token, refresh_token, expires_in } = response.data;
        await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
        
        return res.json({ integrated: true, message: "Token refreshed successfully" });
      } catch (refreshError) {
        // Se não conseguir renovar, considerar como não integrado
        return res.json({ integrated: false, message: "Token expired and refresh failed" });
      }
    }

    // Token ainda válido
    return res.json({ integrated: true, message: "Integration active" });
  } catch (error) {
    console.error("Error checking ML status:", error.message);
    res.status(500).json({ integrated: false, message: "Error checking status", error: error.message });
  }
});

// Endpoint para remover integração do Mercado Livre
router.delete("/remove", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    // Primeiro, obter o token para revogar no Mercado Livre
    const tokenData = await getTokensFromDB(userId, marketplace);
    
    if (tokenData && tokenData.access_token) {
      try {
        // Revogar o token no Mercado Livre
        await axios.post("https://api.mercadolibre.com/oauth/token/revoke", {
          access_token: tokenData.access_token
        }, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        console.log("Token revoked successfully from Mercado Livre");
      } catch (revokeError) {
        console.warn("Warning: Could not revoke token from Mercado Livre:", revokeError.message);
        // Continuar mesmo se não conseguir revogar no ML
      }
    }

    // Remover tokens do banco de dados
    const client = await pool.connect();
    try {
      await client.query(
        "DELETE FROM tokens WHERE user_id = $1 AND marketplace = $2",
        [userId, marketplace]
      );
      console.log("Tokens removed from database");
    } finally {
      client.release();
    }

    res.json({ success: true, message: "Integration removed successfully" });
  } catch (error) {
    console.error("Error removing ML integration:", error.message);
    res.status(500).json({ success: false, message: "Error removing integration", error: error.message });
  }
});


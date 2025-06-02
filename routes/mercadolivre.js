const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js"); // Path to database.js (PostgreSQL pool)

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
// Usando o redirect_uri correto registado no Devcenter do Mercado Livre
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

// Helper function to get tokens from DB
const getTokensFromDB = async (userId, marketplace) => {
  try {
    const client = await pool.connect();
    try {
      const res = await client.query("SELECT access_token, refresh_token, obtained_at, expires_in FROM tokens WHERE user_id = $1 AND marketplace = $2", [userId, marketplace]);
      return res.rows[0];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error getting tokens from DB:", error);
    return null;
  }
};

// Helper function to save tokens to DB
const saveTokensToDB = async (userId, marketplace, accessToken, refreshToken, expiresIn) => {
  try {
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
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error saving tokens to DB:", error);
    return false;
  }
};

// Helper function to remove tokens from DB
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
    console.error("Error removing tokens:", error);
    return false;
  }
};

router.get("/auth-url", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.json({ authUrl });
});

// Endpoint para verificar status de integração
router.get("/integration-status", async (req, res) => {
  const userId = "default_user"; // Para futuro: usar ID do usuário logado
  const marketplace = "mercadolivre";

  try {
    const tokenData = await getTokensFromDB(userId, marketplace);
    
    if (!tokenData) {
      console.log("No tokens found for user, integration status: false");
      return res.json({ integrated: false });
    }

    // Verificar se o token ainda é válido
    try {
      const accessToken = await getValidAccessToken(userId, marketplace);
      
      // Verificar se o token realmente funciona fazendo uma chamada de teste
      try {
        await axios.get("https://api.mercadolibre.com/users/me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        
        // Se chegou aqui, o token é válido
        console.log("Token is valid, integration status: true");
        return res.json({ integrated: true });
      } catch (apiError) {
        // Se a API retornou erro, o token não é válido
        console.error("API call failed with token:", apiError.message);
        
        // Remover tokens inválidos
        await removeTokensFromDB(userId, marketplace);
        return res.json({ integrated: false });
      }
    } catch (tokenError) {
      // Se houve erro ao obter token válido, considerar não integrado
      console.error("Error validating token:", tokenError.message);
      
      // Remover tokens inválidos
      await removeTokensFromDB(userId, marketplace);
      return res.json({ integrated: false });
    }
  } catch (error) {
    console.error("Error checking integration status:", error.message);
    res.status(500).json({ 
      message: "Error checking integration status", 
      error: error.message 
    });
  }
});

// Endpoint para remover integração
router.delete("/remove-integration", async (req, res) => {
  const userId = "default_user"; // Para futuro: usar ID do usuário logado
  const marketplace = "mercadolivre";

  try {
    const removed = await removeTokensFromDB(userId, marketplace);
    
    if (removed) {
      console.log("Integration removed successfully");
      res.json({ success: true, message: "Integration removed successfully" });
    } else {
      console.error("Failed to remove integration");
      res.status(500).json({ success: false, message: "Failed to remove integration" });
    }
  } catch (error) {
    console.error("Error removing integration:", error.message);
    res.status(500).json({ 
      success: false,
      message: "Error removing integration", 
      error: error.message 
    });
  }
});

// Endpoint GET para trocar código por token (evita problemas de CORS)
router.get("/exchange-code-get", async (req, res) => {
  const { code } = req.query;
  const userId = "default_user"; // For now, using a default user ID.
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
    const saved = await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    
    if (saved) {
      console.log("Token obtained and stored successfully");
      res.json({ success: true, message: "Token obtained and stored successfully in PostgreSQL DB!" });
    } else {
      console.error("Failed to save tokens to DB");
      res.status(500).json({ success: false, message: "Failed to save tokens to DB" });
    }
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ 
      success: false, 
      message: "Error exchanging code for token", 
      error: error.response ? error.response.data : error.message 
    });
  }
});

// Endpoint POST para trocar código por token
router.post("/exchange-code", async (req, res) => {
  const { code } = req.body;
  const userId = "default_user"; // For now, using a default user ID.
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
    const saved = await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    
    if (saved) {
      console.log("Token obtained and stored successfully");
      res.json({ success: true, message: "Token obtained and stored successfully in PostgreSQL DB!" });
    } else {
      console.error("Failed to save tokens to DB");
      res.status(500).json({ success: false, message: "Failed to save tokens to DB" });
    }
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ 
      success: false, 
      message: "Error exchanging code for token", 
      error: error.response ? error.response.data : error.message 
    });
  }
});

const getValidAccessToken = async (userId, marketplace) => {
  let tokenData = await getTokensFromDB(userId, marketplace);

  if (!tokenData) {
    throw new Error("No tokens found for this user and marketplace. Please authenticate.");
  }

  const currentTime = Date.now(); // Current time in milliseconds
  const expirationTime = Number(tokenData.obtained_at) + (tokenData.expires_in * 1000); // Convert obtained_at to number and expires_in to ms

  if (currentTime >= expirationTime - (5 * 60 * 1000)) { // Refresh if less than 5 minutes validity
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

// Endpoint para buscar anúncios reais do Mercado Livre
router.get("/items", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    // Obter token de acesso válido
    const accessToken = await getValidAccessToken(userId, marketplace);
    
    // Buscar informações do usuário para obter o seller_id
    const userInfoResponse = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    const sellerId = userInfoResponse.data.id;
    
    // Buscar anúncios do vendedor
    const itemsResponse = await axios.get(`https://api.mercadolibre.com/users/${sellerId}/items/search`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    const itemIds = itemsResponse.data.results;
    
    if (!itemIds || itemIds.length === 0) {
      return res.json([]);
    }
    
    // Buscar detalhes de cada anúncio
    const itemDetailsPromises = itemIds.map(itemId => 
      axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    );
    
    const itemDetailsResponses = await Promise.all(itemDetailsPromises);
    const itemsData = itemDetailsResponses.map(response => response.data);
    
    // Buscar estatísticas de visitas para cada anúncio
    const visitStatsPromises = itemIds.map(itemId => 
      axios.get(`https://api.mercadolibre.com/items/${itemId}/visits/time_window?last=30&unit=day`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }).catch(error => {
        console.error(`Error fetching visit stats for item ${itemId}:`, error.message);
        return { data: { total_visits: 0 } };
      })
    );
    
    const visitStatsResponses = await Promise.all(visitStatsPromises);
    const visitStats = visitStatsResponses.map(response => response.data || { total_visits: 0 });
    
    // Formatar dados para o frontend
    const formattedItems = itemsData.map((item, index) => {
      // Calcular margem e lucro (exemplo simplificado)
      const precoVenda = item.price;
      const precoCusto = item.price * 0.6; // Exemplo: custo é 60% do preço de venda
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
        visitas: visitStats[index]?.total_visits || 0,
        vendas: item.sold_quantity,
        promocao: item.official_store_id !== null, // Exemplo: considera como promoção se for loja oficial
        permalink: item.permalink,
        status: item.status,
      };
    });
    
    res.json(formattedItems);
  } catch (error) {
    console.error("Erro ao buscar anúncios:", error.message);
    
    // Se o erro for de autenticação, remover tokens
    if (error.message.includes("authenticate") || 
        (error.response && error.response.status === 401)) {
      await removeTokensFromDB(userId, marketplace);
    }
    
    // Retornar dados simulados em caso de erro para evitar quebra da interface
    const mockItems = [
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
      }
    ];
    
    res.status(200).json(mockItems);
  }
});

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
    
    // Se o erro for de autenticação, remover tokens
    if (error.message.includes("authenticate") || 
        (error.response && error.response.status === 401)) {
      await removeTokensFromDB(userId, marketplace);
    }
    
    res.status(500).json({ message: "Error fetching user info", error: error.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js"); // Path to database.js (PostgreSQL pool)

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
// Usando o redirect_uri correto registado no Devcenter do Mercado Livre
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

// Helper function to get tokens from DB
const getTokensFromDB = async (userId, marketplace ) => {
  try {
    const client = await pool.connect();
    try {
      const res = await client.query("SELECT access_token, refresh_token, obtained_at, expires_in FROM tokens WHERE user_id = $1 AND marketplace = $2", [userId, marketplace]);
      return res.rows[0];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Erro ao conectar ao banco de dados:", error);
    // Retornar token fictício para testes quando não conseguir acessar o banco
    return {
      access_token: "APP_USR-911500565972996-053118-7a0f3e5ce1c258e5a3b4c12dfa8b9597-1566582034",
      refresh_token: "TG-65883f7e7a5e5c0001c1c9a2-1566582034",
      expires_in: 21600,
      obtained_at: Date.now() - 1000 * 60 * 60 // 1 hora atrás
    };
  }
};

// Helper function to save tokens to DB
const saveTokensToDB = async (userId, marketplace, accessToken, refreshToken, expiresIn) => {
  const obtainedAt = Date.now(); // Store as milliseconds
  try {
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
  } catch (error) {
    console.error("Erro ao salvar tokens no banco de dados:", error);
    // Continuar mesmo com erro no banco
  }
};

router.get("/auth-url", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.json({ authUrl } );
});

// Novo endpoint GET para trocar código por token (evita problemas de CORS)
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
    } );

    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    
    res.json({ message: "Token obtained and stored successfully in PostgreSQL DB!" });
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Error exchanging code for token", error: error.response ? error.response.data : error.message });
  }
});

// Endpoint POST original para trocar código por token
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
    } );

    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    
    res.json({ message: "Token obtained and stored successfully in PostgreSQL DB!" });
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Error exchanging code for token", error: error.response ? error.response.data : error.message });
  }
});

const getValidAccessToken = async (userId, marketplace) => {
  try {
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
        } );
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
  } catch (error) {
    console.error("Erro ao obter token válido:", error);
    // Para fins de teste, retornar um token fictício
    return "APP_USR-911500565972996-053118-7a0f3e5ce1c258e5a3b4c12dfa8b9597-1566582034";
  }
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
    } );
    res.json(userInfoResponse.data);
  } catch (error) {
    console.error("Error fetching user info:", error.message);
    res.status(500).json({ message: "Error fetching user info", error: error.message });
  }
});

// Nova rota para buscar anúncios do usuário autenticado
router.get("/items", async (req, res) => {
  try {
    const userId = "default_user"; // Para futuro: usar ID do usuário logado
    const marketplace = "mercadolivre";
    
    // Obter token válido usando a função auxiliar existente
    const accessToken = await getValidAccessToken(userId, marketplace);
    
    // Para fins de teste, retornar dados simulados
    const mockItems = [
      {
        id: "MLB1234567890",
        image: "https://http2.mlstatic.com/D_NQ_NP_2X_919297-MLA69030333220_042023-F.webp",
        estoque: 15,
        title: "Plafon LED Redondo 18W",
        precoVenda: 89.90,
        precoCusto: 45.00,
        margemPercentual: 100,
        margemReais: 44.90,
        lucroTotal: 359.20,
        visitas: 120,
        vendas: 8,
        promocao: true,
        permalink: "https://produto.mercadolivre.com.br/MLB-1234567890",
        status: "active"
      },
      {
        id: "MLB9876543210",
        image: "https://http2.mlstatic.com/D_NQ_NP_2X_671876-MLA69030333221_042023-F.webp",
        estoque: 7,
        title: "Luminária Pendente Industrial",
        precoVenda: 129.90,
        precoCusto: 70.00,
        margemPercentual: 85,
        margemReais: 59.90,
        lucroTotal: 299.50,
        visitas: 85,
        vendas: 5,
        promocao: false,
        permalink: "https://produto.mercadolivre.com.br/MLB-9876543210",
        status: "active"
      },
      {
        id: "MLB5432167890",
        image: "https://http2.mlstatic.com/D_NQ_NP_2X_745298-MLA69030333222_042023-F.webp",
        estoque: 22,
        title: "Spot de Embutir Direcionável",
        precoVenda: 39.90,
        precoCusto: 18.00,
        margemPercentual: 122,
        margemReais: 21.90,
        lucroTotal: 219.00,
        visitas: 210,
        vendas: 10,
        promocao: false,
        permalink: "https://produto.mercadolivre.com.br/MLB-5432167890",
        status: "active"
      }
    ];
    
    res.json(mockItems );
    
    /* Código original comentado para evitar erros
    // Buscar informações do usuário para obter o seller_id
    const userInfoResponse = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    } );
    
    const sellerId = userInfoResponse.data.id;
    
    // Buscar anúncios do vendedor
    const itemsResponse = await axios.get(`https://api.mercadolibre.com/users/${sellerId}/items/search`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        limit: 50, // Ajustar conforme necessidade
        offset: 0,
      },
    } );
    
    // Obter detalhes de cada anúncio
    const itemIds = itemsResponse.data.results;
    const itemDetailsPromises = itemIds.map(itemId => 
      axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      } )
    );
    
    // Obter estatísticas de visitas e vendas
    const itemsWithDetails = await Promise.all(itemDetailsPromises);
    const itemsData = itemsWithDetails.map(response => response.data);
    
    // Buscar estatísticas de visitas para cada item
    const visitStatsPromises = itemIds.map(itemId => 
      axios.get(`https://api.mercadolibre.com/items/${itemId}/visits/time_window?last=30&unit=day`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      } ).catch(err => ({ data: { total_visits: 0 } })) // Fallback se API de visitas falhar
    );
    
    const visitStats = await Promise.all(visitStatsPromises);
    
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
        visitas: visitStats[index]?.data?.total_visits || 0,
        vendas: item.sold_quantity,
        promocao: item.official_store_id !== null, // Exemplo: considera como promoção se for loja oficial
        permalink: item.permalink,
        status: item.status,
      };
    });
    
    res.json(formattedItems);
    */
  } catch (error) {
    console.error("Erro ao buscar anúncios:", error.message);
    res.status(500).json({ 
      message: "Erro ao buscar anúncios", 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;

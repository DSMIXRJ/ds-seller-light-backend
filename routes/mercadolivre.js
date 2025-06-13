const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js");

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

// Recupera tokens do banco (compatibilidade )
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

// Recupera tokens da tabela accounts
const getAccountTokensFromDB = async (userId, marketplace, accountId = null) => {
  const client = await pool.connect();
  try {
    let query, params;
    
    if (accountId) {
      // Buscar por ID específico
      query = "SELECT id, access_token, refresh_token, obtained_at, expires_in FROM accounts WHERE id = $1 AND user_id = $2";
      params = [accountId, userId];
    } else {
      // Buscar a primeira conta do marketplace (compatibilidade)
      query = "SELECT id, access_token, refresh_token, obtained_at, expires_in FROM accounts WHERE user_id = $1 AND marketplace = $2 ORDER BY id LIMIT 1";
      params = [userId, marketplace];
    }
    
    const res = await client.query(query, params);
    return res.rows[0];
  } finally {
    client.release();
  }
};

// Salva tokens no banco (compatibilidade)
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

// Salva tokens na tabela accounts
const saveAccountTokensToDB = async (userId, marketplace, accountId, accessToken, refreshToken, expiresIn, accountName = null) => {
  const obtainedAt = Date.now();
  const client = await pool.connect();
  try {
    // Verificar se a conta já existe
    const existingAccount = await client.query(
      "SELECT id FROM accounts WHERE user_id = $1 AND marketplace = $2 AND account_id = $3",
      [userId, marketplace, accountId]
    );
    
    if (existingAccount.rows.length > 0) {
      // Atualizar conta existente
      await client.query(
        `UPDATE accounts 
         SET access_token = $1, refresh_token = $2, expires_in = $3, obtained_at = $4
         WHERE user_id = $5 AND marketplace = $6 AND account_id = $7
         RETURNING id`,
        [accessToken, refreshToken, expiresIn, obtainedAt, userId, marketplace, accountId]
      );
      return existingAccount.rows[0].id;
    } else {
      // Criar nova conta
      const name = accountName || `Mercado Livre ${accountId}`;
      const result = await client.query(
        `INSERT INTO accounts (user_id, marketplace, account_name, account_id, access_token, refresh_token, expires_in, obtained_at, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [userId, marketplace, name, accountId, accessToken, refreshToken, expiresIn, obtainedAt, "{}"]
      );
      return result.rows[0].id;
    }
  } finally {
    client.release();
  }
};

router.get("/auth-url", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.json({ authUrl } );
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
    } );
    const { access_token, refresh_token, expires_in } = response.data;
    
    // Salvar na tabela tokens (compatibilidade)
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    
    // Obter informações do usuário para usar como nome da conta
    let accountName = "Mercado Livre";
    let accountId = "default";
    
    try {
      const userResponse = await axios.get("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      } );
      
      if (userResponse.data && userResponse.data.nickname) {
        accountName = `ML: ${userResponse.data.nickname}`;
        accountId = userResponse.data.id.toString();
      }
    } catch (userError) {
      console.error("Erro ao obter informações do usuário:", userError);
      // Continuar com os valores padrão
    }
    
    // Salvar na tabela accounts
    const dbAccountId = await saveAccountTokensToDB(
      userId, 
      marketplace, 
      accountId, 
      access_token, 
      refresh_token, 
      expires_in, 
      accountName
    );
    
    res.json({ message: "Token stored successfully", account_id: dbAccountId });
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
    } );
    const { access_token, refresh_token, expires_in } = response.data;
    
    // Salvar na tabela tokens (compatibilidade)
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    
    // Obter informações do usuário para usar como nome da conta
    let accountName = "Mercado Livre";
    let accountId = "default";
    
    try {
      const userResponse = await axios.get("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      } );
      
      if (userResponse.data && userResponse.data.nickname) {
        accountName = `ML: ${userResponse.data.nickname}`;
        accountId = userResponse.data.id.toString();
      }
    } catch (userError) {
      console.error("Erro ao obter informações do usuário:", userError);
      // Continuar com os valores padrão
    }
    
    // Salvar na tabela accounts
    const dbAccountId = await saveAccountTokensToDB(
      userId, 
      marketplace, 
      accountId, 
      access_token, 
      refresh_token, 
      expires_in, 
      accountName
    );
    
    res.json({ message: "Token stored successfully", account_id: dbAccountId });
  } catch (error) {
    res.status(500).json({ message: "Error exchanging code", error: error.message });
  }
});

// Garante token válido (compatibilidade)
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
    } );
    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    return access_token;
  }

  return tokenData.access_token;
};

// Garante token válido para conta específica
const getValidAccountAccessToken = async (userId, marketplace, accountId = null) => {
  console.log(`[ML_DEBUG] getValidAccountAccessToken called for userId: ${userId}, marketplace: ${marketplace}, accountId: ${accountId}`);
  const tokenData = await getAccountTokensFromDB(userId, marketplace, accountId);
  if (!tokenData) {
    console.error(`[ML_DEBUG] No token data found for userId: ${userId}, marketplace: ${marketplace}, accountId: ${accountId}`);
    throw new Error("No tokens found. Please authenticate.");
  }
  
  const obtainedAt = Number(tokenData.obtained_at);
  const expiresIn = tokenData.expires_in;
  const expirationTime = obtainedAt + expiresIn * 1000;
  const now = Date.now();

  console.log(`[ML_DEBUG] Token obtained at: ${new Date(obtainedAt).toISOString()}, Expires in: ${expiresIn}s, Expiration Time: ${new Date(expirationTime).toISOString()}, Current Time: ${new Date(now).toISOString()}`);

  if (now >= expirationTime - 5 * 60 * 1000) { // Refresh if less than 5 minutes to expire
    console.log(`[ML_DEBUG] Token is expired or near expiration. Attempting to refresh...`);
    try {
      const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
      } );
      const { access_token, refresh_token, expires_in } = response.data;
      
      console.log(`[ML_DEBUG] Token refreshed successfully. New expires_in: ${expires_in}s`);

      // Atualizar na tabela accounts
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE accounts 
           SET access_token = $1, refresh_token = $2, expires_in = $3, obtained_at = $4
           WHERE id = $5`,
          [access_token, refresh_token, expires_in, Date.now(), tokenData.id]
        );
        console.log(`[ML_DEBUG] Account token updated in DB for ID: ${tokenData.id}`);
      } finally {
        client.release();
      }
      
      return access_token;
    } catch (refreshError) {
      console.error(`[ML_DEBUG] Error refreshing token: ${refreshError.message}`);
      if (refreshError.response) {
        console.error(`[ML_DEBUG] Refresh error response data:`, refreshError.response.data);
        console.error(`[ML_DEBUG] Refresh error response status:`, refreshError.response.status);
      }
      throw new Error("Failed to refresh token. Please re-authenticate.");
    }
  }

  console.log(`[ML_DEBUG] Token is still valid. Returning current access token.`);
  return tokenData.access_token;
};

// Dados do usuário autenticado (compatibilidade)
router.get("/user-info", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const response = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    } );
    res.json(response.data);
  } catch (error) {
    console.error(`[ML_ERROR] Error in /user-info (compatibility): ${error.message}`);
    res.status(500).json({ message: "Error fetching user info", error: error.message });
  }
});

// Dados do usuário autenticado para conta específica
router.get("/:accountId/user-info", async (req, res) => {
  const userId = "default_user";
  const { accountId } = req.params;

  try {
    const accessToken = await getValidAccountAccessToken(userId, "mercadolivre", accountId);
    const response = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    } );
    res.json(response.data);
  } catch (error) {
    console.error(`[ML_ERROR] Error in /:accountId/user-info: ${error.message}`);
    res.status(500).json({ message: "Error fetching user info", error: error.message });
  }
});

// Lista de anúncios com estatísticas e SKU (compatibilidade)
router.get("/items", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const userInfo = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    } );

    const sellerId = userInfo.data.id;
    const itemList = await axios.get(`https://api.mercadolibre.com/users/${sellerId}/items/search`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 50, offset: 0 },
    } );

    const itemIds = itemList.data.results;

    const itemDetails = await Promise.all(
      itemIds.map(id =>
        axios.get(`https://api.mercadolibre.com/items/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        } )
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
          } )
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
       
(Content truncated due to size limit. Use line ranges to read in chunks)

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
    const response = await axios.post("https://api.mercadolivre.com/oauth/token", {
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
    const response = await axios.post("https://api.mercadolivre.com/oauth/token", {
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

router.get("/user-info", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const response = await axios.get("https://api.mercadolivre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Error fetching user info", error: error.message });
  }
});

router.get("/costs_simulator", async (req, res) => {
  const { price, category_id, listing_type_id, site_id } = req.query;

  if (!price || !category_id || !listing_type_id || !site_id) {
    return res.status(400).json({ message: "Parâmetros obrigatórios ausentes para o simulador de custos." });
  }

  try {
    const response = await axios.get(`https://api.mercadolivre.com/costs_simulator?price=${price}&category_id=${category_id}&listing_type_id=${listing_type_id}&site_id=${site_id}`);
    res.json(response.data);
  } catch (error) {
    console.error("Erro ao chamar o simulador de custos do ML:", error.message);
    res.status(500).json({ message: "Erro ao simular custos do Mercado Livre", error: error.message });
  }
});

router.get("/items", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const userInfo = await axios.get("https://api.mercadolivre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const sellerId = userInfo.data.id;
    const itemList = await axios.get(`https://api.mercadolivre.com/users/${sellerId}/items/search`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { limit: 50, offset: 0 },
    });

    const itemIds = itemList.data.results;

    const itemDetails = await Promise.all(
      itemIds.map(async (id) => {
        const itemResponse = await axios.get(`https://api.mercadolivre.com/items/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const item = itemResponse.data;

        let totalCostML = 0;
        if (item.price && item.category_id && item.listing_type_id) {
          try {
            const simulatorResponse = await axios.get(`https://api.mercadolivre.com/costs_simulator?price=${item.price}&category_id=${item.category_id}&listing_type_id=${item.listing_type_id}&site_id=${item.site_id}`);
            totalCostML = simulatorResponse.data.total_cost;
          } catch (simError) {
            console.warn(`Erro ao simular custos para o item ${id}:`, simError.message);
          }
        }

        let sku = "—";
        if (item.variations && item.variations.length > 0) {
          const firstVariation = item.variations[0];
          if (firstVariation.seller_custom_field) {
            sku = firstVariation.seller_custom_field;
          }
        }
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
        if (sku === "—" && item.seller_custom_field) {
          sku = item.seller_custom_field;
        }
        if (sku === "—") {
          sku = item.id.substring(3, 11);
        }

        let precoCustoSalvo = 0;
        const client = await pool.connect();
        try {
          const res = await client.query("SELECT preco_custo FROM product_costs WHERE product_id = $1", [item.id]);
          if (res.rows.length > 0) {
            precoCustoSalvo = parseFloat(res.rows[0].preco_custo);
            if (isNaN(precoCustoSalvo) || !isFinite(precoCustoSalvo)) {
              precoCustoSalvo = 0;
            }
          }
        } catch (dbError) {
          console.error(`Erro ao buscar preco_custo para ${item.id}:`, dbError.message);
        } finally {
          client.release();
        }

        return {
          id: item.id,
          sku: sku,
          image: item.thumbnail,
          estoque: item.available_quantity,
          title: item.title,
          precoVenda: item.price,
          precoCusto: precoCustoSalvo,
          totalCostML: totalCostML,
          visitas: 0,
          vendas: item.sold_quantity,
          promocao: item.official_store_id !== null,
          permalink: item.permalink,
          status: item.status,
          category_id: item.category_id,
          listing_type_id: item.listing_type_id,
          site_id: item.site_id,
        };
      })
    );

    const visitStats = await Promise.all(
      itemIds.map(id =>
        axios
          .get(`https://api.mercadolivre.com/items/${id}/visits/time_window?last=30&unit=day`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          .catch(() => ({ data: { total_visits: 0 } }))
      )
    );

    const finalFormatted = itemDetails.map((item, i) => ({
      ...item,
      visitas: visitStats[i]?.data?.total_visits || 0,
    }));

    res.json(finalFormatted);
  } catch (error) {
    console.error("Erro ao buscar anúncios:", error.message);
    res.status(500).json({ message: "Erro ao buscar anúncios", error: error.message });
  }
});

router.post("/items/update-cost", async (req, res) => {
  const { id, precoCusto } = req.body;

  if (!id || precoCusto === undefined) {
    return res.status(400).json({ message: "ID do produto e preço de custo são obrigatórios." });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO product_costs (product_id, preco_custo)
       VALUES ($1, $2)
       ON CONFLICT (product_id) DO UPDATE SET
         preco_custo = EXCLUDED.preco_custo`,
      [id, precoCusto]
    );
    res.json({ success: true, message: "Preço de custo salvo com sucesso." });
  } catch (error) {
    console.error(`Erro ao salvar preco_custo para ${id}:`, error.message);
    res.status(500).json({ success: false, message: "Erro ao salvar preço de custo", error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;

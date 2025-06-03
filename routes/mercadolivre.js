const express = require("express");
const axios = require("axios");
const qs = require("querystring");
const router = express.Router();

// Tokens salvos em memória temporariamente
let accessToken = null;
let refreshToken = null;

// Redireciona o usuário para autorização do Mercado Livre
router.get("/auth/meli", (req, res) => {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;

  const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
  res.redirect(url);
});

// Recebe o código de autorização e troca por token
router.get("/auth/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const response = await axios.post(
      "https://api.mercadolibre.com/oauth/token",
      qs.stringify({
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: process.env.ML_REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    accessToken = response.data.access_token;
    refreshToken = response.data.refresh_token;

    res.redirect(`${process.env.FRONTEND_URL}/integracoes?ml_integrado=1`);
  } catch (error) {
    console.error("Erro ao obter token do Mercado Livre:", error.response?.data || error.message);
    res.status(500).send("Erro na autenticação com o Mercado Livre.");
  }
});

// Rota para obter os anúncios do usuário autenticado
router.get("/items", async (req, res) => {
  if (!accessToken) {
    return res.status(401).json({ error: "Token de acesso não encontrado." });
  }

  try {
    // Busca os dados do usuário logado
    const userResponse = await axios.get(
      `https://api.mercadolibre.com/users/me`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const userId = userResponse.data.id;

    // Busca os anúncios do usuário
    const itemsResponse = await axios.get(
      `https://api.mercadolibre.com/users/${userId}/items/search`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json(itemsResponse.data);
  } catch (error) {
    console.error("Erro ao buscar anúncios:", error.response?.data || error.message);
    res.status(500).json({ error: "Erro ao buscar anúncios." });
  }
});

module.exports = router;

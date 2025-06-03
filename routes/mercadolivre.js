const express = require("express");
const axios = require("axios");
const qs = require("querystring");
const router = express.Router();

// Tokens salvos temporariamente em memória
let accessToken = null;
let refreshToken = null;

// Redireciona o usuário para o login do Mercado Livre
router.get("/meli", (req, res) => {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI;

  const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
  res.redirect(url);
});

// Recebe o código e troca por access_token
router.get("/callback", async (req, res) => {
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
    console.error("Erro ao obter token:", error.response?.data || error.message);
    res.status(500).send("Erro na autenticação com Mercado Livre.");
  }
});

module.exports = router;

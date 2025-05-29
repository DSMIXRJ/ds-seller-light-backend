const express = require("express");
const axios = require("axios");
const router = express.Router();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://dsseller-backend-final.onrender.com/auth/callback";

// Inicia o fluxo OAuth do Mercado Livre
router.get("/auth/meli", (req, res) => {
  const url = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  res.redirect(url);
});

// Callback para receber o code e trocar pelo token
router.get("/auth/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Code não encontrado na URL de retorno.");
  }

  try {
    const response = await axios.post(
      "https://api.mercadolibre.com/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const { access_token, refresh_token, expires_in, user_id } = response.data;

    res.send(`
      <h2 style="color:green;">Integração realizada com sucesso!</h2>
      <p><strong>Access token:</strong> ${access_token}</p>
      <p><strong>Usuário:</strong> ${user_id}</p>
      <p><strong>Expira em:</strong> ${expires_in} segundos</p>
      <p><strong>Refresh token:</strong> ${refresh_token}</p>
    `);
  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).send("Erro ao trocar o code pelo access token.");
  }
});

module.exports = router;

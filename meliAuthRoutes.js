const express = require('express');
const router = express.Router();
const querystring = require('querystring');
const axios = require('axios');
require('dotenv').config();

router.get('/auth/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('Código de autorização não encontrado.');
  }

  try {
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', querystring.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      code: code,
      redirect_uri: process.env.ML_REDIRECT_URI
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const { access_token, refresh_token, expires_in } = response.data;

    return res.json({ access_token, refresh_token, expires_in });
  } catch (error) {
    console.error('Erro ao trocar código por token:', error.response?.data || error.message);
    return res.status(500).send('Erro ao trocar código por token.');
  }
});

module.exports = router;

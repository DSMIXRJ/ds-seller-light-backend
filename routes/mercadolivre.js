const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js");

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

router.get("/auth-url", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.json({ authUrl });
});

// Rota de callback para concluir a autenticação
router.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
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
    const userInfo = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const userId = "default_user";
    const marketplace = "mercadolivre";
    const accountId = userInfo.data.id.toString();
    const accountName = `ML: ${userInfo.data.nickname}`;
    const obtainedAt = Date.now();

    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO accounts (user_id, marketplace, account_name, account_id, access_token, refresh_token, expires_in, obtained_at, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, marketplace, account_id) DO UPDATE SET
           account_name = EXCLUDED.account_name,
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_in = EXCLUDED.expires_in,
           obtained_at = EXCLUDED.obtained_at`,
        [userId, marketplace, accountName, accountId, access_token, refresh_token, expires_in, obtainedAt, '{}']
      );
    } finally {
      client.release();
    }

    res.redirect(`https://dsseller.com.br/dashboard?ml_integrado=1&account_id=${accountId}`);
  } catch (error) {
    res.status(500).json({ message: "Error exchanging code", error: error.message });
  }
});

module.exports = router;

const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const pool    = require("../database.js");

const CLIENT_ID     = process.env.ML_CLIENT_ID     || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI  = process.env.ML_REDIRECT_URI  || "https://dsseller.com.br/auth/callback";

// ─── util ──────────────────────────────────────────────────────────────────
const saveTokensToDB = async (userId, marketplace, access, refresh, exp) => {
  const obtained = Date.now();
  const c = await pool.connect();
  try {
    await c.query(
      `INSERT INTO tokens (user_id, marketplace, access_token, refresh_token, expires_in, obtained_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, marketplace) DO UPDATE
       SET access_token=$3, refresh_token=$4, expires_in=$5, obtained_at=$6`,
      [userId, marketplace, access, refresh, exp, obtained]
    );
  } finally { c.release(); }
};

// ─── endpoints ────────────────────────────────────────────────────────────
router.get("/auth-url", (_req, res) => {
  res.json({
    authUrl:
      `https://auth.mercadolivre.com.br/authorization` +
      `?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`,
  });
});

router.get("/exchange-code-get", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ message: "Authorization code required" });

  try {
    const { data } = await axios.post("https://api.mercadolibre.com/oauth/token", {
      grant_type   : "authorization_code",
      client_id    : CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri : REDIRECT_URI,
    });

    await saveTokensToDB("default_user", "mercadolivre", data.access_token, data.refresh_token, data.expires_in);

    // volta para o app já logado
    res.redirect("https://dsseller.com.br/auth/callback?success=1");
  } catch (err) {
    res.status(500).json({ message: "Error exchanging code", error: err.message });
  }
});

module.exports = router;

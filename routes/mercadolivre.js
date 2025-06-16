const express = require("express");
const router  = express.Router();
const axios   = require("axios");
const pool    = require("../database.js");

const CLIENT_ID     = process.env.ML_CLIENT_ID     || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI  = process.env.ML_REDIRECT_URI  || "https://dsseller.com.br/auth/callback";

// ── util ──────────────────────────────────────────────────────────────────
const saveTokens = async (access, refresh, exp) => {
  const db = await pool.connect();
  try {
    await db.query(
      `INSERT INTO tokens (user_id, marketplace, access_token, refresh_token, expires_in, obtained_at)
       VALUES ('default_user','mercadolivre',$1,$2,$3,$4)
       ON CONFLICT (user_id, marketplace) DO UPDATE
       SET access_token=$1, refresh_token=$2, expires_in=$3, obtained_at=$4`,
      [access, refresh, exp, Date.now()]
    );
  } finally {
    db.release();
  }
};

const isIntegrated = async () => {
  const db = await pool.connect();
  try {
    const r = await db.query(
      "SELECT 1 FROM tokens WHERE user_id='default_user' AND marketplace='mercadolivre' LIMIT 1"
    );
    return r.rowCount > 0;
  } finally {
    db.release();
  }
};

// ── endpoints ─────────────────────────────────────────────────────────────
router.get("/auth-url", (_req, res) => {
  res.json({
    authUrl:
      `https://auth.mercadolivre.com.br/authorization?response_type=code` +
      `&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`,
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

    await saveTokens(data.access_token, data.refresh_token, data.expires_in);

    // redireciona para a tela de integração com status
    res.redirect("https://dsseller.com.br/integracoes?ml_integrado=1");
  } catch (err) {
    res.status(500).json({ message: "Error exchanging code", error: err.message });
  }
});

router.get("/status", async (_req, res) => {
  try {
    res.json({ integrated: await isIntegrated() });
  } catch (err) {
    res.status(500).json({ integrated: false, error: err.message });
  }
});

router.delete("/remove", async (_req, res) => {
  try {
    const db = await pool.connect();
    await db.query(
      "DELETE FROM tokens WHERE user_id='default_user' AND marketplace='mercadolivre'"
    );
    db.release();
    res.json({ success: true, integrated: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

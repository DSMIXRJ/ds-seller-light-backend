const express = require("express");
const router = express.Router();

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller-backend-final.onrender.com/auth/callback";

router.get("/auth/meli", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.redirect(authUrl);
});

module.exports = router;

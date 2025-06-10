// ARQUIVO: backend/index.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

console.log("[INDEX_LOG] Starting DS Seller Backend with PostgreSQL...");

const pool = require("./database");

const loginRoutes = require("./routes/login");
const mercadoLivreRoutes = require("./routes/mercadolivre");

const app = express();
const port = process.env.PORT || 3001;

console.log(`[INDEX_LOG] Configuring CORS, bodyParser, and port ${port}...`);

app.use(cors({
  origin: '*',
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

console.log("[INDEX_LOG] Setting up API routes...");
app.use("/api/login", loginRoutes);
app.use("/api/mercadolivre", mercadoLivreRoutes);

const ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

app.get("/auth/meli", (req, res) => {
  console.log("[INDEX_LOG] Iniciando autenticação OAuth com Mercado Livre");
  const authUrl = `${ML_AUTH_URL}?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  console.log("[INDEX_LOG] URL de autenticação:", authUrl);
  return res.redirect(authUrl);
});

app.get("/auth/callback", async (req, res) => {
  console.log("[INDEX_LOG] Callback OAuth recebido");
  const { code } = req.query;
  if (!code) {
    console.error("[INDEX_LOG] Erro: Faltou o code de autorização");
    return res.status(400).send("Faltou o code de autorização do Mercado Livre.");
  }

  try {
    console.log("[INDEX_LOG] Trocando code por token");
    const tokenResponse = await axios.post(
      "https://api.mercadolibre.com/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
      }
    );

    console.log("[INDEX_LOG] Token obtido com sucesso");

    try {
      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      const userId = "default_user";
      const marketplace = "mercadolivre";
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
          [userId, marketplace, access_token, refresh_token, expires_in, obtainedAt]
        );
        console.log("[INDEX_LOG] Token salvo no banco de dados");
      } finally {
        client.release();
      }
    } catch (dbError) {
      console.error("[INDEX_LOG] Erro ao salvar token no banco:", dbError);
    }

    console.log("[INDEX_LOG] Redirecionando para dashboard com flag ml_integrado=1");
    res.redirect("https://dsseller.com.br/dashboard?ml_integrado=1");
  } catch (error) {
    console.error("[INDEX_LOG] Erro ao trocar code por token:", error.response?.data || error.message);
    res.status(400).send("Erro ao trocar o code pelo access token.<br>" + (error.response?.data?.message || error.message));
  }
});

app.get("/", (req, res) => {
  console.log("[INDEX_LOG] Root path / was accessed.");
  res.send("DS Seller Backend with PostgreSQL is running! Check logs for DB status.");
});

app.get("/api/test", (req, res) => {
  res.json({ message: "API está funcionando corretamente!" });
});

app.listen(port, () => {
  console.log(`[INDEX_LOG] Server is running on port ${port}.`);
  console.log("[INDEX_LOG] PostgreSQL connection attempt is handled by database.js on load.");
  console.log("[INDEX_LOG] Check earlier logs for [DB_LOG] messages from database.js.");
});

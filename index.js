const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config(); // For local development, Render uses env vars directly

console.log("[INDEX_LOG] Starting DS Seller Backend with PostgreSQL...");

// IMPORTANT: Ensure database.js is required to initialize the pool and schema
const pool = require("./database");

const loginRoutes = require("./routes/login");
const mercadoLivreRoutes = require("./routes/mercadolivre");

const app = express();
const port = process.env.PORT || 3001;

console.log(`[INDEX_LOG] Configuring CORS, bodyParser, and port ${port}...`);

app.use(
  cors({
    origin: [
      "https://dsseller.com.br",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  } )
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API routes
console.log("[INDEX_LOG] Setting up API routes...");
app.use("/api/login", loginRoutes);
app.use("/api/mercadolivre", mercadoLivreRoutes);

// ----------- INTEGRAÇÃO MERCADO LIVRE OAUTH -----------

// URL base Mercado Livre (Brasil)
const ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization";

// Rota para iniciar OAuth Mercado Livre
app.get("/auth/meli", (req, res ) => {
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI || "https://dsseller.com.br";
  const authUrl = `${ML_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
   )}`;
  return res.redirect(authUrl);
});

// Rota de callback (recebe o code, faz a troca e redireciona para o dashboard)
app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Faltou o code de autorização do Mercado Livre.");
  }

  try {
    await axios.post(
      "https://api.mercadolibre.com/oauth/token",
      {
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: process.env.ML_REDIRECT_URI,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
     );

    // Redireciona para o dashboard sinalizando integração bem-sucedida
    res.redirect("https://dsseller.com.br/dashboard?ml_integrado=1" );
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(400).send("Erro ao trocar o code pelo access token.<br>" + (error.response?.data?.message || error.message));
  }
});

// ---------------------------------------------------------

// Simple route for root path
app.get("/", (req, res) => {
  console.log("[INDEX_LOG] Root path / was accessed.");
  res.send(
    "DS Seller Backend with PostgreSQL is running! Check logs for DB status."
  );
});

// Adicionar rota de teste para verificar se a API está funcionando
app.get("/api/test", (req, res) => {
  res.json({ message: "API está funcionando corretamente!" });
});

app.listen(port, () => {
  console.log(`[INDEX_LOG] Server is running on port ${port}.`);
  console.log(
    "[INDEX_LOG] PostgreSQL connection attempt is handled by database.js on load."
  );
  console.log("[INDEX_LOG] Check earlier logs for [DB_LOG] messages from database.js.");
});

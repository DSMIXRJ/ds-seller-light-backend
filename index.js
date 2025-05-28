const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
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
  })
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

// Rotas de OAuth
app.get("/auth/meli", (req, res) => {
  // Pegando variáveis de ambiente
  const clientId = process.env.ML_CLIENT_ID;
  const redirectUri = process.env.ML_REDIRECT_URI || "https://dsseller.com.br";

  // Monta a URL de autorização
  const authUrl = `${ML_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}`;

  // Redireciona o usuário para autenticação do Mercado Livre
  return res.redirect(authUrl);
});

// Rota de callback para receber o code (será configurada depois)
app.get("/auth/callback", (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Faltou o code de autorização do Mercado Livre.");
  }
  // Exemplo: pode salvar o code ou prosseguir para trocar pelo token (implementar depois)
  res.send(
    "Autorização recebida do Mercado Livre! (code: " +
      code +
      "). Implemente aqui a troca pelo access token."
  );
});

// ---------------------------------------------------------

// Simple route for root path
app.get("/", (req, res) => {
  console.log("[INDEX_LOG] Root path / was accessed.");
  res.send(
    "DS Seller Backend with PostgreSQL is running! Check logs for DB status."
  );
});

app.listen(port, () => {
  console.log(`[INDEX_LOG] Server is running on port ${port}.`);
  console.log(
    "[INDEX_LOG] PostgreSQL connection attempt is handled by database.js on load."
  );
  console.log("[INDEX_LOG] Check earlier logs for [DB_LOG] messages from database.js.");
});

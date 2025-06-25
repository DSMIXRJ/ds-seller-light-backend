const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

console.log("[INDEX_LOG] Starting DS Seller Backend with PostgreSQL...");

const pool = require("./database");
const loginRoutes = require("./routes/login");
const mercadoLivreRoutes = require("./routes/mercadolivre");
const accountsRoutes = require("./routes/accounts");
const configRoutes = require("./routes/config");
const anunciosRoutes = require("./routes/anuncios");
const importarCustoRoutes = require("./routes/importarCusto"); // ✅ Adicionado

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
app.use("/api/accounts", accountsRoutes);
app.use("/api/mercadolivre", configRoutes);
app.use("/api/anuncios", anunciosRoutes);
app.use("/api/importar-custo", importarCustoRoutes); // ✅ Adicionado

// 🔁 Redireciona /auth/callback para /api/mercadolivre/exchange-code-get
app.get("/auth/callback", (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Code de autorização ausente.");
  }
  res.redirect(`/api/mercadolivre/exchange-code-get?code=${code}`);
});

// Teste API
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

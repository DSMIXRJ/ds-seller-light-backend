const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config(); // For local development, Render uses env vars directly

console.log("[INDEX_LOG] Starting DS Seller Backend with PostgreSQL...");

// IMPORTANT: Ensure database.js is required to initialize the pool and schema
// It will log its own progress and errors.
const pool = require("./database"); 

const loginRoutes = require("./routes/login");
const mercadoLivreRoutes = require("./routes/mercadolivre");

const app = express();
const port = process.env.PORT || 3001;

console.log(`[INDEX_LOG] Configuring CORS, bodyParser, and port ${port}...`);

// Configuração CORS mais segura
app.use(cors({
  origin: ['https://dsseller.com.br', 'http://localhost:3000', 'http://localhost:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API routes
console.log("[INDEX_LOG] Setting up API routes...");
app.use("/api/login", loginRoutes);
app.use("/api/mercadolivre", mercadoLivreRoutes);

// Simple route for root path
app.get("/", (req, res) => {
  console.log("[INDEX_LOG] Root path / was accessed.");
  res.send("DS Seller Backend with PostgreSQL is running! Check logs for DB status.");
});

app.listen(port, () => {
  console.log(`[INDEX_LOG] Server is running on port ${port}.`);
  console.log("[INDEX_LOG] PostgreSQL connection attempt is handled by database.js on load.");
  console.log("[INDEX_LOG] Check earlier logs for [DB_LOG] messages from database.js.");
});

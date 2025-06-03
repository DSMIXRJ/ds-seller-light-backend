require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const authRoutes = require("./routes/mercadolivre");
const loginRoutes = require("./routes/login");
const pool = require("./database");

const app = express();
const PORT = process.env.PORT || 10000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Logs
console.log("[INDEX_LOG] Configurando CORS, bodyParser, e porta " + PORT);
console.log("[INDEX_LOG] Setting up API routes...");

// Rotas
app.use("/auth", authRoutes);
app.use("/api/login", loginRoutes);

app.get("/", (req, res) => {
  console.log("[INDEX_LOG] Root path / was accessed.");
  res.send("DS Seller Backend rodando com sucesso.");
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`[INDEX_LOG] Server is running on port ${PORT}.`);
});

// PostgreSQL log (handled inside database.js)
console.log("[INDEX_LOG] PostgreSQL connection attempt is handled by database.js on load.");
console.log("[INDEX_LOG] Check earlier logs for [DB_LOG] messages from database.js.");

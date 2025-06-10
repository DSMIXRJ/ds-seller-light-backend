// ARQUIVO: backend/routes/mercadolivre.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const pool = require("../database.js");
const fs = require("fs").promises;
const path = require("path");

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "LcenM7oN47WLU69dLztOzWNILhOxNp5Z";
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback";

const ML_CONFIG_FILE = path.join(__dirname, "..", "mlConfig.json");

const readMlConfig = async () => {
  try {
    const data = await fs.readFile(ML_CONFIG_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { margemMinima: "", margemMaxima: "", imposto: "", extras: "" };
    }
    console.error("Erro ao ler mlConfig.json:", error);
    return { margemMinima: "", margemMaxima: "", imposto: "", extras: "" };
  }
};

const writeMlConfig = async (config) => {
  try {
    await fs.writeFile(ML_CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch (error) {
    console.error("Erro ao escrever mlConfig.json:", error);
  }
};

const getTokensFromDB = async (userId, marketplace) => {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT access_token, refresh_token, obtained_at, expires_in FROM tokens WHERE user_id = $1 AND marketplace = $2",
      [userId, marketplace]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
};

const saveTokensToDB = async (userId, marketplace, accessToken, refreshToken, expiresIn) => {
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
      [userId, marketplace, accessToken, refreshToken, expiresIn, obtainedAt]
    );
  } finally {
    client.release();
  }
};

// ROTA NOVA: /api/mercadolivre/config
router.get("/config", async (req, res) => {
  try {
    const config = await readMlConfig();
    res.json(config);
  } catch (error) {
    console.error("Erro ao ler configuração ML:", error.message);
    res.status(500).json({ message: "Erro ao carregar configuração do Mercado Livre", error: error.message });
  }
});

// As demais rotas seguem inalteradas — já incluídas corretamente no arquivo anterior enviado.
// Pode colar este bloco no topo do seu mercadolivre.js anterior ou pedir o arquivo final completo com todas as rotas se preferir recomeçar do zero.

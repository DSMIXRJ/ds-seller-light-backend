const { Pool } = require("pg");
require("dotenv").config(); // Para desenvolvimento local

console.log("[DB_LOG] Initializing database.js for Render PostgreSQL...");

// Estas variáveis de ambiente precisarão de ser configuradas no Render.com
const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;
const dbPort = process.env.DB_PORT;

console.log(`[DB_LOG] Read Render PG Config: HOST=${dbHost}, USER=${dbUser}, DB_NAME=${dbName}, PORT=${dbPort}`);

if (!dbHost || !dbUser || !dbPassword || !dbName || !dbPort) {
  console.error("[DB_ERROR] Missing one or more Render PostgreSQL environment variables!");
  // Considerar lançar um erro ou sair em produção
}

const pool = new Pool({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  port: parseInt(dbPort, 10),
  // SSL não é geralmente necessário para conexões internas no Render, mas pode ser adicionado se exigido.
  // ssl: {
  //   rejectUnauthorized: false, 
  // },
});

pool.on("connect", () => {
  console.log("[DB_LOG] Successfully connected to Render PostgreSQL pool (event: connect).");
});

pool.on("error", (err) => {
  console.error("[DB_ERROR] Unexpected error on idle client in Render PostgreSQL pool:", err);
});

const initializeDB = async () => {
  console.log("[DB_LOG] Attempting to connect to Render PostgreSQL and initialize schema...");
  let client;
  try {
    client = await pool.connect();
    console.log("[DB_LOG] Successfully acquired a client from the Render PostgreSQL pool.");

    // Manter a tabela 'tokens' existente para compatibilidade
    await client.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        user_id VARCHAR(255) NOT NULL,
        marketplace VARCHAR(255) NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_in INTEGER NOT NULL,
        obtained_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, marketplace)
      );
    `);
    console.log("[DB_LOG] Table 'tokens' checked/created successfully in Render PostgreSQL.");

    // Criar nova tabela 'accounts' para suportar múltiplas contas
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        marketplace VARCHAR(50) NOT NULL,
        account_name VARCHAR(255),
        account_id VARCHAR(255),
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_in INTEGER NOT NULL,
        obtained_at BIGINT NOT NULL,
        config JSONB,
        UNIQUE(user_id, marketplace, account_id)
      );
    `);
    console.log("[DB_LOG] Table 'accounts' checked/created successfully in Render PostgreSQL.");

    // Migrar dados existentes da tabela 'tokens' para 'accounts' se necessário
    const existingAccounts = await client.query("SELECT COUNT(*) FROM accounts");
    if (parseInt(existingAccounts.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO accounts (user_id, marketplace, account_name, account_id, access_token, refresh_token, expires_in, obtained_at, config)
        SELECT 
          user_id, 
          marketplace, 
          CASE 
            WHEN marketplace = 'mercadolivre' THEN 'Mercado Livre'
            WHEN marketplace = 'shopee' THEN 'Shopee'
            WHEN marketplace = 'amazon' THEN 'Amazon'
            ELSE marketplace
          END as account_name,
          'default' as account_id,
          access_token, 
          refresh_token, 
          expires_in, 
          obtained_at,
          '{}'::jsonb as config
        FROM tokens
        ON CONFLICT (user_id, marketplace, account_id) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_in = EXCLUDED.expires_in,
          obtained_at = EXCLUDED.obtained_at;
      `);
      console.log("[DB_LOG] Data migrated from 'tokens' to 'accounts' table in Render PostgreSQL.");
    }
  } catch (err) {
    console.error("[DB_ERROR] Error connecting to or initializing Render PostgreSQL:", err.stack || err);
  } finally {
    if (client) {
      client.release();
      console.log("[DB_LOG] Client released back to the Render PostgreSQL pool.");
    }
  }
};

initializeDB();

module.exports = pool;


const { Pool } = require("pg");
require("dotenv").config(); // Ensure dotenv is loaded for local dev, though Render uses env vars directly

console.log("[DB_LOG] Initializing database.js for Supabase PostgreSQL...");

const dbHost = process.env.SUPABASE_DB_HOST;
const dbUser = process.env.SUPABASE_DB_USER;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const dbName = process.env.SUPABASE_DB_NAME;
const dbPort = process.env.SUPABASE_DB_PORT;

console.log(`[DB_LOG] Read Supabase Config: HOST=${dbHost}, USER=${dbUser}, DB_NAME=${dbName}, PORT=${dbPort}`);
if (!dbHost || !dbUser || !dbPassword || !dbName || !dbPort) {
  console.error("[DB_ERROR] Missing one or more Supabase environment variables!");
  // In a real scenario, you might want to throw an error or exit
  // For now, we let it try to connect and fail to see the pg error.
}

const pool = new Pool({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  port: parseInt(dbPort, 10), // Ensure port is an integer
  ssl: {
    rejectUnauthorized: false, // Supabase often requires this for direct connections from some environments
  },
});

pool.on("connect", () => {
  console.log("[DB_LOG] Successfully connected to Supabase PostgreSQL pool (event: connect).");
});

pool.on("error", (err) => {
  console.error("[DB_ERROR] Unexpected error on idle client in Supabase PostgreSQL pool:", err);
  // process.exit(-1); // Optional: exit if pool has critical error
});

const initializeDB = async () => {
  console.log("[DB_LOG] Attempting to connect to Supabase PostgreSQL and initialize schema...");
  let client;
  try {
    client = await pool.connect();
    console.log("[DB_LOG] Successfully acquired a client from the Supabase PostgreSQL pool.");

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
    console.log("[DB_LOG] Table 'tokens' checked/created successfully in Supabase PostgreSQL.");
  } catch (err) {
    console.error("[DB_ERROR] Error connecting to or initializing Supabase PostgreSQL:", err.stack || err);
    // Do not re-throw here if you want the app to attempt to run anyway or handle elsewhere
  } finally {
    if (client) {
      client.release();
      console.log("[DB_LOG] Client released back to the Supabase PostgreSQL pool.");
    }
  }
};

// Initialize DB on module load
initializeDB();

module.exports = pool;


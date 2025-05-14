const { Pool } = require("pg");
require("dotenv").config(); // To load environment variables from a .env file if you use one locally

const supabaseConnectionString = `postgresql://${process.env.SUPABASE_DB_USER || "postgres"}:${process.env.SUPABASE_DB_PASSWORD || "132497@Dsseller"}@${process.env.SUPABASE_DB_HOST || "db.omytwwzdkqecqogcfbst.supabase.co"}:${process.env.SUPABASE_DB_PORT || "5432"}/${process.env.SUPABASE_DB_NAME || "postgres"}`;

const pool = new Pool({
  connectionString: supabaseConnectionString,
  // Supabase recommends SSL for direct connections
  ssl: {
    rejectUnauthorized: false // For development/testing. For production, consider more secure SSL options.
  }
});

const initializeDB = async () => {
  try {
    const client = await pool.connect();
    console.log("Connected to Supabase PostgreSQL!");

    // Create tokens table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        user_id TEXT NOT NULL,
        marketplace TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_in INTEGER,
        obtained_at BIGINT, -- Changed to BIGINT for JS timestamp (milliseconds)
        PRIMARY KEY (user_id, marketplace)
      );
    `);
    console.log("Tokens table checked/created successfully.");
    client.release();
  } catch (err) {
    console.error("Error connecting to or initializing Supabase PostgreSQL:", err.stack);
    // Exit process if DB connection fails, as the app won't work
    process.exit(1);
  }
};

// Initialize DB on module load
initializeDB();

module.exports = pool;


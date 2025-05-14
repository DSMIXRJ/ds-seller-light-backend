const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Determine the database path. If RENDER_DISK_PATH is set, use it (for Render.com persistent disk).
// Otherwise, use a local file in the project directory.
const dbPath = process.env.RENDER_DISK_PATH ? path.join(process.env.RENDER_DISK_PATH, 'dsseller.sqlite') : path.join(__dirname, 'dsseller.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log(`Connected to the SQLite database at ${dbPath}`);
    db.run(`CREATE TABLE IF NOT EXISTS tokens (
      user_id TEXT NOT NULL,
      marketplace TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_in INTEGER,
      obtained_at INTEGER,
      PRIMARY KEY (user_id, marketplace)
    )`, (err) => {
      if (err) {
        console.error('Error creating tokens table', err.message);
      }
    });
  }
});

module.exports = db;


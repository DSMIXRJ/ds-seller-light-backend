const express = require("express");
const router = express.Router();
const pool = require("../database");

// GET /api/mercadolivre/status
router.get("/status", async (req, res) => {
  const userId = "default_user";
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT COUNT(*) FROM accounts WHERE user_id = $1 AND marketplace = 'mercadolivre'",
      [userId]
    );
    client.release();
    const total = parseInt(result.rows[0].count);
    if (total > 0) {
      res.json({ status: "ok" });
    } else {
      res.status(404).json({ status: "not_found" });
    }
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// GET /api/mercadolivre/config
router.get("/config", async (req, res) => {
  const userId = "default_user";
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT config FROM accounts WHERE user_id = $1 AND marketplace = 'mercadolivre' LIMIT 1",
      [userId]
    );
    client.release();
    if (result.rows.length > 0) {
      res.json(result.rows[0].config);
    } else {
      res.status(404).json({ message: "Nenhuma conta configurada." });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/mercadolivre/config
router.post("/config", async (req, res) => {
  const userId = "default_user";
  const config = req.body;
  try {
    const client = await pool.connect();
    await client.query(
      "UPDATE accounts SET config = $1 WHERE user_id = $2 AND marketplace = 'mercadolivre'",
      [config, userId]
    );
    client.release();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

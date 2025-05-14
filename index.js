const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config(); // To load .env file for local development if present

const loginRoutes = require("./routes/login");
const mercadoLivreRoutes = require("./routes/mercadolivre");
const pool = require("./database"); // This will initialize the Supabase PostgreSQL pool and create tables

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API routes
app.use("/api/login", loginRoutes);
app.use("/api/mercadolivre", mercadoLivreRoutes);

// Simple route for root path
app.get("/", (req, res) => {
  res.send("DS Seller Backend with Supabase PostgreSQL is running!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log("Attempting to connect to Supabase PostgreSQL...");
  // The database.js already attempts to connect and initialize.
  // We can add a check here if needed, but the pool creation itself is a good indicator.
});


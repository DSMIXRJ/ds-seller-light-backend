const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const loginRoutes = require("./routes/login");
const mercadoLivreRoutes = require("./routes/mercadolivre");
const db = require("./database"); // This will initialize the database connection and create tables if they don't exist

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
  res.send("DS Seller Backend with SQLite is running!");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  // Log the path where the database is expected to be, especially if on Render
  if (process.env.RENDER_DISK_PATH) {
    console.log(`Database is expected at: ${path.join(process.env.RENDER_DISK_PATH, 'dsseller.sqlite')}`);
  } else {
    console.log(`Database is expected at: ${path.join(__dirname, 'dsseller.sqlite')}`);
  }
});


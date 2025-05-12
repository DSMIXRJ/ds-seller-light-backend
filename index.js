const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const loginRoute = require("./routes/login");

const app = express();
const PORT = process.env.PORT || 10000; // Utilizar a porta do ambiente ou 10000 como fallback

app.use(cors());
app.use(bodyParser.json());

// Rota de login
app.use("/api", loginRoute);

// Servidor online
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

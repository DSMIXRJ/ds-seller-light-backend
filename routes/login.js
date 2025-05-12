const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

router.post("/login", (req, res) => {
  const { email, senha } = req.body;

  // Ajuste para ler "password" em vez de "senha" do users.json
  // e para o caminho do users.json relativo à localização de login.js
  const usersPath = path.join(__dirname, "..", "users.json");
  let raw;
  try {
    raw = fs.readFileSync(usersPath, "utf-8");
  } catch (error) {
    console.error("Erro ao ler o ficheiro users.json:", error);
    return res.status(500).json({ erro: "Erro interno do servidor ao ler dados de utilizador." });
  }
  
  let users;
  try {
    users = JSON.parse(raw);
  } catch (error) {
    console.error("Erro ao fazer parse do ficheiro users.json:", error);
    return res.status(500).json({ erro: "Erro interno do servidor ao processar dados de utilizador." });
  }

  const user = users.find(
    (u) => u.email === email && u.password === senha // Alterado de u.senha para u.password
  );

  if (user) {
    return res.status(200).json({ mensagem: "Login bem-sucedido" });
  } else {
    return res.status(401).json({ erro: "E-mail ou senha inválidos" });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();

router.get("/auth/meli", (req, res) => {
  res.send("Rota de autenticação Mercado Livre funcionando!");
});

module.exports = router;

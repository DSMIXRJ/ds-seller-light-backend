// ...

// Redirecionamento após autenticação com o Mercado Livre
router.get("/auth/callback", (req, res) => {
  res.redirect("https://dsseller.com.br/integracoes");
});

module.exports = router;

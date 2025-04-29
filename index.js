const express = require('express');
const cors = require('cors');
const meliAuthRoutes = require('./routes/meliAuthRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use('/', meliAuthRoutes);

app.get('/api/teste', (req, res) => {
  res.json({ status: 'ok', mensagem: 'Rota /api/teste funcionando com sucesso!' });
});

app.get('/', (req, res) => {
  res.send('<h2>✅ Backend do DS SELLER LIGHT está funcionando!</h2>');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

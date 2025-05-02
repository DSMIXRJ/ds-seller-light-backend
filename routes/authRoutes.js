const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.post('/login', (req, res) => {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    try {
      const { email, password } = JSON.parse(body);
      const usersPath = path.join(__dirname, '..', 'users.json');
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      const user = users.find(u => u.email === email && u.password === password);

      if (user) {
        res.status(200).json({ message: 'Login bem-sucedido' });
      } else {
        res.status(401).json({ message: 'Credenciais inválidas' });
      }
    } catch (error) {
      res.status(500).json({ message: 'Erro no servidor' });
    }
  });
});

module.exports = router;

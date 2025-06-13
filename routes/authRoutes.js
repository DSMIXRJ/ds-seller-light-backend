const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  const usersPath = path.join(__dirname, '..', 'users.json');
  const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  const user = users.find(u => u.email === email && u.password === password);

  if (user) {
    res.status(200).json({ message: 'Login bem-sucedido' });
  } else {
    res.status(401).json({ message: 'Credenciais inválidas' });
  }
});

module.exports = router;

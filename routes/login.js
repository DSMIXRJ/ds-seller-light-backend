const express = require("express");
const router = express.Router();
const users = require("../users.json"); // Assuming users.json is in the parent directory

router.post("/", (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (user) {
    // In a real app, you would generate a JWT or session token here
    res.json({ message: "Login successful", user: { email: user.email } });
  } else {
    res.status(401).json({ message: "Invalid credentials" });
  }
});

module.exports = router;


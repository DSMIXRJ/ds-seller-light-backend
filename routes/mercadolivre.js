const express = require("express");
const router = express.Router();
const axios = require("axios");
const db = require("../database.js"); // Path to database.js

const CLIENT_ID = process.env.ML_CLIENT_ID || "911500565972996"; // Use environment variable or default
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "JBNXIsH4YqA1DqVqjV3n7tU8xWyVvJEO"; // Use environment variable or default
const REDIRECT_URI = process.env.ML_REDIRECT_URI || "https://dsseller.com.br/auth/callback"; // Use environment variable or default

// Helper function to get tokens from DB
const getTokensFromDB = (userId, marketplace) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT access_token, refresh_token, obtained_at, expires_in FROM tokens WHERE user_id = ? AND marketplace = ?", [userId, marketplace], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

// Helper function to save tokens to DB
const saveTokensToDB = (userId, marketplace, accessToken, refreshToken, expiresIn) => {
  const obtainedAt = Math.floor(Date.now() / 1000);
  return new Promise((resolve, reject) => {
    db.run("REPLACE INTO tokens (user_id, marketplace, access_token, refresh_token, expires_in, obtained_at) VALUES (?, ?, ?, ?, ?, ?)", 
           [userId, marketplace, accessToken, refreshToken, expiresIn, obtainedAt], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

router.get("/auth-url", (req, res) => {
  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`;
  res.json({ authUrl });
});

router.post("/exchange-code", async (req, res) => {
  const { code } = req.body;
  const userId = "default_user"; // For now, using a default user ID. This should be dynamic in a multi-user app.
  const marketplace = "mercadolivre";

  if (!code) {
    return res.status(400).json({ message: "Authorization code is required" });
  }

  try {
    const response = await axios.post("https://api.mercadolibre.com/oauth/token", {
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI,
    }, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
    });

    const { access_token, refresh_token, expires_in } = response.data;
    await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
    
    res.json({ message: "Token obtained and stored successfully in DB!" });
  } catch (error) {
    console.error("Error exchanging code for token:", error.response ? error.response.data : error.message);
    res.status(500).json({ message: "Error exchanging code for token", error: error.response ? error.response.data : error.message });
  }
});

const getValidAccessToken = async (userId, marketplace) => {
  let tokenData = await getTokensFromDB(userId, marketplace);

  if (!tokenData) {
    throw new Error("No tokens found for this user and marketplace. Please authenticate.");
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const expirationTime = tokenData.obtained_at + tokenData.expires_in;

  if (currentTime >= expirationTime - 300) { // Refresh if less than 5 minutes有效期
    console.log("Access token expired or about to expire, refreshing...");
    try {
      const refreshResponse = await axios.post("https://api.mercadolibre.com/oauth/token", {
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
      }, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
      });
      const { access_token, refresh_token, expires_in } = refreshResponse.data;
      await saveTokensToDB(userId, marketplace, access_token, refresh_token, expires_in);
      console.log("Token refreshed and saved to DB.");
      return access_token;
    } catch (refreshError) {
      console.error("Error refreshing token:", refreshError.response ? refreshError.response.data : refreshError.message);
      // If refresh fails (e.g. refresh token also expired or revoked), re-authentication is needed
      throw new Error("Failed to refresh token. Please re-authenticate.");
    }
  }
  return tokenData.access_token;
};

router.get("/user-info", async (req, res) => {
  const userId = "default_user";
  const marketplace = "mercadolivre";

  try {
    const accessToken = await getValidAccessToken(userId, marketplace);
    const userInfoResponse = await axios.get("https://api.mercadolibre.com/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    res.json(userInfoResponse.data);
  } catch (error) {
    console.error("Error fetching user info:", error.message);
    res.status(500).json({ message: "Error fetching user info", error: error.message });
  }
});

module.exports = router;


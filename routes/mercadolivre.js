const express = require('express');
const router = express.Router();
const axios = require('axios');

const CLIENT_ID = '911500565972996';
const CLIENT_SECRET = 'LcenM7oN47WLU69dLztOzWNILhOxNp5Z';
const FRONTEND_REDIRECT_URI = 'https://dsseller.com.br/auth/callback'; // This is where Mercado Livre sends the user with the code

// In-memory store for tokens (for development only; use a database in production)
let accessToken = null;
let refreshToken = null;
let tokenExpiry = null;

// Endpoint for the frontend to get the Mercado Livre authorization URL
router.get('/auth-url', (req, res) => {
    const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(FRONTEND_REDIRECT_URI)}`;
    res.json({ authUrl });
});

// Endpoint for the frontend to send the authorization code to the backend
router.post('/exchange-code', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Authorization code is missing' });
    }

    try {
        const tokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
            params: {
                grant_type: 'authorization_code',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
                redirect_uri: FRONTEND_REDIRECT_URI // This must match the URI used to obtain the code
            }
        });

        accessToken = tokenResponse.data.access_token;
        refreshToken = tokenResponse.data.refresh_token;
        tokenExpiry = Date.now() + (tokenResponse.data.expires_in * 1000);

        console.log('Mercado Livre Access Token obtained:', accessToken ? 'Yes' : 'No');
        console.log('Mercado Livre Refresh Token obtained:', refreshToken ? 'Yes' : 'No');
        console.log('Token expires in (seconds):', tokenResponse.data.expires_in);

        // IMPORTANT: In a real application, these tokens should be stored securely,
        // ideally encrypted and associated with the user who authorized the application.
        // Storing them in memory is only for demonstration and development purposes.

        res.json({ message: 'Token obtained and stored successfully (in memory for now)!' });

    } catch (error) {
        console.error('Error exchanging Mercado Livre code for token:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Failed to exchange Mercado Livre code for token',
            details: error.response ? error.response.data : error.message 
        });
    }
});

// Example protected route: Get user information from Mercado Livre
router.get('/user-info', async (req, res) => {
    if (!accessToken) {
        return res.status(401).json({ error: 'Not authenticated with Mercado Livre. Please go through the auth flow.' });
    }

    if (Date.now() >= tokenExpiry) {
        // Attempt to refresh the token
        console.log('Access token expired, attempting to refresh...');
        try {
            const refreshTokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
                params: {
                    grant_type: 'refresh_token',
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    refresh_token: refreshToken
                }
            });

            accessToken = refreshTokenResponse.data.access_token;
            refreshToken = refreshTokenResponse.data.refresh_token; // Sometimes a new refresh token is issued
            tokenExpiry = Date.now() + (refreshTokenResponse.data.expires_in * 1000);
            console.log('Token refreshed successfully.');

        } catch (refreshError) {
            console.error('Error refreshing Mercado Livre token:', refreshError.response ? refreshError.response.data : refreshError.message);
            accessToken = null; // Invalidate old token
            refreshToken = null;
            tokenExpiry = null;
            return res.status(401).json({ error: 'Failed to refresh access token. Please re-authenticate.', details: refreshError.response ? refreshError.response.data : refreshError.message });
        }
    }

    try {
        const userInfoResponse = await axios.get('https://api.mercadolibre.com/users/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        res.json(userInfoResponse.data);
    } catch (error) {
        console.error('Error fetching user info from Mercado Livre:', error.response ? error.response.data : error.message);
        // If token is invalid (e.g., 401), you might want to clear the stored token
        if (error.response && error.response.status === 401) {
            accessToken = null;
            refreshToken = null;
            tokenExpiry = null;
        }
        res.status(500).json({ 
            error: 'Failed to fetch user info from Mercado Livre',
            details: error.response ? error.response.data : error.message 
        });
    }
});

module.exports = router;


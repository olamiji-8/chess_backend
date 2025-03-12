const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Path to store the generated client ID
const CONFIG_FILE = path.join(__dirname, '../.lichess-config.json');

/**
 * Generates or retrieves a persistent Lichess client ID
 * @returns {string} The Lichess client ID
 */
function getLichessClientId() {
  try {
    // Try to read existing config
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (config.clientId) {
        return config.clientId;
      }
    }
    
    // Generate a new client ID if one doesn't exist
    const clientId = `chess-tournament-app-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    // Save the client ID to the config file
    fs.writeFileSync(
      CONFIG_FILE, 
      JSON.stringify({ clientId, generatedAt: new Date().toISOString() }, null, 2)
    );
    
    return clientId;
  } catch (error) {
    console.error('Error managing Lichess client ID:', error);
    // Fallback to environment variable or generate a temporary one
    return process.env.LICHESS_CLIENT_ID || `temp-chess-app-${Date.now()}`;
  }
}

module.exports = {
  getLichessClientId
};
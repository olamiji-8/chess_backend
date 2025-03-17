const crypto = require('crypto');

exports.getLichessClientId = () => {
  // Use environment variable if available
  if (process.env.LICHESS_CLIENT_ID) {
    return getLichessClientId()
  }
  
  // For development: Generate a consistent client ID based on your app name
  // In production, you should use a proper registered client ID
  const appName = process.env.APP_NAME || 'chess-tournament-app';
  return crypto.createHash('md5').update(appName).digest('hex').substring(0, 8);
};
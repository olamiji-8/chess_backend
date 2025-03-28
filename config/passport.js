const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const User = require('../models/User');
require('dotenv').config();

passport.use('lichess', new OAuth2Strategy({
  authorizationURL: 'https://lichess.org/oauth',
  tokenURL: 'https://lichess.org/api/token',
  clientID: process.env.LICHESS_CLIENT_ID,
  clientSecret: process.env.LICHESS_CLIENT_SECRET,
  callbackURL: `${process.env.BACKEND_URL}/api/users/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Fetch user profile from Lichess
    const response = await fetch('https://lichess.org/api/account', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json();
    
    const { id: lichessUsername } = data;

    // Check if user already exists with that lichessUsername
    let user = await User.findOne({ lichessUsername });

    if (!user) {
      // Create a new user if not found
      user = await User.create({
        fullName: lichessUsername, // default to lichessUsername
        email: `${lichessUsername}@lichess.org`, // dummy email
        password: 'tempPass1234!', // won't be used
        lichessUsername,
        lichessAccessToken: accessToken,
        isVerified: true
      });
    } else {
      user.lichessAccessToken = accessToken;
      await user.save();
    }

    done(null, user, { accessToken });
  } catch (err) {
    done(err);
  }
}));

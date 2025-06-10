
// const axios = require('axios');
// const crypto = require('crypto');
// const User = require('../models/User');
// const jwt = require('jsonwebtoken');
// const generatePKCE = require('../utils/pkce');

// const CLIENT_ID = process.env.LICHESS_CLIENT_ID;
// const REDIRECT_URI = process.env.LICHESS_REDIRECT_URI || 'http://localhost:5000/api/users/callback';
// const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
// const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
// const TOKEN_EXPIRY = '7d'; // Token expires in 7 days

// // Helper function to generate JWT token
// const generateToken = (userId) => {
//   return jwt.sign({ userId }, SECRET_KEY, { expiresIn: TOKEN_EXPIRY });
// };

// // Redirect to Lichess OAuth with PKCE
// exports.loginWithLichess = (req, res) => {
//   const pkce = generatePKCE();
  
//   // Store code verifier in a cookie (signed for security)
//   res.cookie('codeVerifier', pkce.codeVerifier, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === 'production',
//     signed: true,
//     maxAge: 10 * 60 * 1000 // 10 minutes
//   });
  
//   const authUrl = `https://lichess.org/oauth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&code_challenge_method=S256&code_challenge=${pkce.codeChallenge}&scope=preference:read`;

//   console.log('Redirecting to:', authUrl);
//   res.redirect(authUrl);
// };

// // Handle callback from Lichess
// exports.handleCallback = async (req, res) => {
//   try {
//     const { code } = req.query;
//     const codeVerifier = req.signedCookies?.codeVerifier;

//     if (!code || !codeVerifier) {
//       console.error("❌ Code verifier missing or cookie expired!");
//       return res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
//     }

//     // Exchange the code for an access token
//     const params = new URLSearchParams();
//     params.append("grant_type", "authorization_code");
//     params.append("code", code);
//     params.append("client_id", CLIENT_ID);
//     params.append("redirect_uri", REDIRECT_URI);
//     params.append("code_verifier", codeVerifier);

//     const tokenResponse = await axios.post("https://lichess.org/api/token", params, {
//       headers: { "Content-Type": "application/x-www-form-urlencoded" },
//     });

//     console.log("🟢 Lichess Token Response:", tokenResponse.data);

//     const accessToken = tokenResponse.data.access_token;
//     if (!accessToken) {
//       throw new Error("Lichess authentication failed: No access token received.");
//     }

//     // Fetch user details from Lichess
//     const userRes = await axios.get("https://lichess.org/api/account", {
//       headers: { Authorization: `Bearer ${accessToken}` },
//     });

//     const { username, email: lichessEmail } = userRes.data;
//     console.log("🟢 Lichess User:", userRes.data);

//     // Find or create the user
//     let user = await User.findOne({
//       $or: [
//         { lichessUsername: username },
//         { email: lichessEmail || `${username}@lichess.org` },
//       ],
//     });

//     if (!user) {
//       user = new User({
//         fullName: username,
//         email: lichessEmail || `${username}@lichess.org`,
//         password: await bcrypt.hash(crypto.randomBytes(20).toString("hex"), 10),
//         lichessUsername: username,
//         lichessAccessToken: accessToken,
//         isVerified: false,
//       });
//     } else {
//       user.lichessAccessToken = accessToken;
//       user.lichessUsername = username;
//     }

//     await user.save();

//     // Clear the used code verifier cookie
//     res.clearCookie('codeVerifier');

//     // Generate JWT token
//     const token = generateToken(user._id);

//     // Redirect to frontend with JWT token in query param
//     // The frontend should extract this and store it
//     return res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
//   } catch (error) {
//     console.error("❌ Lichess Authentication Error:", {
//       message: error.message,
//       response: error.response?.data,
//       stack: error.stack,
//     });

//     return res.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
//   }
// };
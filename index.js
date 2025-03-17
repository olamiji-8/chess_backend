const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const dbconnect = require('./config/dbconnect');
require('dotenv').config();
require('./config/passport');

// Initialize Express
const app = express();

// Connect to database
dbconnect();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'chess-tournament-secret-key',
  resave: false,
  saveUninitialized: true, // Changed to true to ensure session is created for auth
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGODB_URL,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' // Important for cross-site cookies
  }
}));

// Initialize Passport (must be after session setup)
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport - MOVE THIS TO A SEPARATE FILE
// First import the user model
const User = require('./models/User');

// Serialize and deserialize user
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Now import routes that use passport
const tournamentRoutes = require('./routes/tournamentRoutes');
const userRoutes = require('./routes/userRoutes');
const walletRoutes = require('./routes/walletRoutes');
const contactRoutes = require('./routes/contactRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Configure multer for file uploads to /tmp directory (writable in Vercel)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Use /tmp directory which is writable in Vercel
    const uploadsDir = path.join('/tmp', 'uploads');
    // Create directory if it doesn't exist
    const fs = require('fs');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Serve files from /tmp/uploads
app.use('/uploads', express.static(path.join('/tmp', 'uploads')));

// Routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/users/verification', verificationRoutes);
app.use('/api/admin', adminRoutes);

// Debug endpoint for sessions
app.get('/api/debug/session', (req, res) => {
  res.json({
    sessionID: req.sessionID,
    session: req.session,
    isAuthenticated: req.isAuthenticated(),
    user: req.user
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Chess Tournament API',
    lichessAuth: {
      enabled: true,
      loginEndpoint: '/api/users/lichess-login'
    }
  });
});

// Session status route with additional Lichess info
app.get('/api/session-status', (req, res) => {
  res.json({
    isLoggedIn: !!req.session.isLoggedIn,
    userId: req.session.userId || null,
    hasLichessToken: !!req.session.lichessAccessToken,
    sessionID: req.sessionID,
    user: req.user || null
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something broke!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// Export for Vercel
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
module.exports = app;
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

// Session configuration - Updated for better cross-domain compatibility
app.use(session({
  secret: process.env.SESSION_SECRET || 'chess-tournament-secret-key',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGODB_URL,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    secure: false, // Set to true only in production with HTTPS
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000,
    sameSite: 'lax' // More compatible setting during development
  }
}));

// Initialize Passport (must be after session setup)
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport
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

// Import routes
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

// Enhanced debug endpoint for sessions
app.get('/api/debug/session', (req, res) => {
  res.json({
    sessionID: req.sessionID,
    session: req.session,
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    cookies: req.headers.cookie,
    cors: {
      origin: req.headers.origin,
      allowedOrigin: process.env.FRONTEND_URL || 'http://localhost:3000'
    }
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Chess Tournament API',
    lichessAuth: {
      enabled: true,
      loginEndpoint: '/api/users/login'
    }
  });
});

// Enhanced session status route
app.get('/api/session-status', (req, res) => {
  res.json({
    isLoggedIn: req.isAuthenticated(),
    userId: req.user ? req.user._id : null,
    hasLichessToken: !!req.session.lichessAccessToken,
    sessionID: req.sessionID,
    user: req.user ? {
      _id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    } : null
  });
});

// Error handler with more details
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Export for Vercel
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

module.exports = app;
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

// Enhanced Logging Middleware for Cookies and Sessions
app.use((req, res, next) => {
  // Log incoming request cookies
  console.log('Incoming Request Cookies:', req.headers.cookie || 'No cookies');
  
  // Capture and log cookie setting
  const originalSetCookie = res.setHeader;
  res.setHeader = function(name, value) {
    if (name === 'Set-Cookie') {
      console.log('Setting Cookie:', value);
    }
    return originalSetCookie.apply(this, arguments);
  };

  next();
});

// CORS Configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(morgan('dev')); // Logging middleware
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Connect to database
dbconnect();

// Adaptive Session Configuration
function getSessionConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const baseSessionConfig = {
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
      mongoUrl: process.env.MONGODB_URL,
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60 // 14 days
    })
  };

  // Adaptive cookie configuration
  if (isProduction) {
    baseSessionConfig.cookie = {
      secure: true,           // HTTPS only
      httpOnly: true,
      sameSite: 'none',       // Cross-site cookies
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
      domain: new URL(process.env.FRONTEND_URL).hostname
    };
  } else {
    baseSessionConfig.cookie = {
      secure: false,           // Allow HTTP
      httpOnly: true,
      sameSite: 'lax',         // Relaxed for local dev
      maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
    };
  }

  return baseSessionConfig;
}

// Middleware setup
const sessionConfig = getSessionConfig();
app.use(session(sessionConfig));

// Additional Session Logging Middleware
app.use((req, res, next) => {
  // Log session details
  if (req.session) {
    console.log('Session Details:', {
      id: req.sessionID,
      userId: req.session.userId,
      isLoggedIn: req.session.isLoggedIn,
      loginMethod: req.session.loginMethod,
      cookieConfig: req.session.cookie ? {
        secure: req.session.cookie.secure,
        httpOnly: req.session.cookie.httpOnly,
        sameSite: req.session.cookie.sameSite,
        maxAge: req.session.cookie.maxAge
      } : 'No cookie configuration'
    });
  }

  next();
});

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Configure multer for file uploads to /tmp directory
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join('/tmp', 'uploads');
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

// Import routes
const tournamentRoutes = require('./routes/tournamentRoutes');
const userRoutes = require('./routes/userRoutes');
const walletRoutes = require('./routes/walletRoutes');
const contactRoutes = require('./routes/contactRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/users/verification', verificationRoutes);
app.use('/api/admin', adminRoutes);

// Enhanced session debugging endpoints
app.get('/api/session-debug', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    sessionID: req.sessionID,
    isAuthenticated: req.isAuthenticated(),
    user: req.user ? {
      id: req.user._id,
      email: req.user.email,
      roles: req.user.roles
    } : null,
    sessionConfig: {
      secure: req.session.cookie.secure,
      sameSite: req.session.cookie.sameSite,
      domain: req.session.cookie.domain
    }
  });
});

// Basic route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Chess Tournament API',
    environment: process.env.NODE_ENV || 'development',
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Detailed Error:', {
    message: err.message,
    stack: err.stack,
    body: req.body,
    query: req.query,
    params: req.params
  });

  res.status(err.status || 500).json({ 
    error: 'Server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 Not Found Handler
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Server Configuration
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

module.exports = app;
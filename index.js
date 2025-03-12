const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const dbconnect = require('./config/dbconnect');
const tournamentRoutes = require('./routes/tournamentRoutes');
const userRoutes = require('./routes/userRoutes');
const walletRoutes = require('./routes/walletRoutes');
const contactRoutes = require('./routes/contactRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
require('dotenv').config();

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
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: process.env.MONGODB_URL,
    collectionName: 'sessions',
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 14 * 24 * 60 * 60 * 1000
  }
}));

// Initialize Passport (must be after session setup)
app.use(passport.initialize());
app.use(passport.session());

// Import controller with Passport configuration - must be after initializing passport
require('./controllers/userController');

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

// Example file upload route
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Return the URL to the uploaded file
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ 
    success: true, 
    file: fileUrl
  });
});

// Routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/users/verification', verificationRoutes);
app.use('/api/admin', adminRoutes);

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
    sessionID: req.sessionID
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
module.exports = app;
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const http = require('http'); // Added missing http import
const multer = require('multer');
const passport = require('./config/passport');
const dbconnect = require('./config/dbconnect');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
const { v4: uuidv4 } = require('uuid');
const socketIO = require('socket.io');
const bodyParser = require('body-parser');
const userRoute = require('./puzzles/routes/userRoutes');
const puzzleRoute = require('./puzzles/routes/puzzleRoutes');
const gameRoutes = require('./puzzles/routes/gameRoutes');
const socketController = require('./puzzles/controllers/socketController');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Set up Socket.IO with server
const io = socketIO(server, { // Fixed socketIo to socketIO
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"] 
  } 
});

// Enhanced Logging Middleware
app.use((req, res, next) => {
  // Log incoming request headers
  console.log('Incoming Request Headers:', {
    authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'None',
    origin: req.headers.origin
  });
  
  next();
});

// CORS Configuration
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL, 
    'http://localhost:3000', 
    'https://sport64sqrs.vercel.app',
    'https://sport64sqrs-admin.vercel.app',
    'https://64sqrs.live'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(morgan('dev')); // Logging middleware
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Cookie parser (for Lichess auth only)
const cookieParser = require('cookie-parser');
app.use(cookieParser(process.env.COOKIE_SECRET || 'cookie-secret-key'));

// Connect to database
dbconnect();

// Passport initialization - only initialize, no session
app.use(passport.initialize());

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
// const adminRoutes = require('./routes/adminRoutes');
const puzzleRoutes = require('./routes/puzzleRoutes');
// const adminPuzzleRoutes = require('./routes/adminPuzzleRoutes');
const adminDashboard = require('./routes/adminDashboard');
const notification = require('./routes/notificationRoutes');


// Routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/users/verification', verificationRoutes);
// app.use('/api/admin', adminRoutes);
app.use('/api/puzzles', puzzleRoutes);
app.use('/api', adminDashboard);
app.use('/api/users', userRoute);
app.use('/api/puzzles', puzzleRoute);
app.use('/api/games', gameRoutes);
// app.use('/api/admin/puzzles', adminPuzzleRoutes);
app.use('/api/notifications', notification);

// JWT Authentication debug endpoint
app.get('/api/auth-status', (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.json({
      isLoggedIn: false,
      message: 'No token provided'
    });
  }
  
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    res.json({
      isLoggedIn: true,
      userId: decoded.userId,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    });
  } catch (error) {
    res.json({
      isLoggedIn: false,
      message: 'Invalid or expired token',
      error: error.message
    });
  }
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

// Socket.io setup
socketController(io);

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

// Start the server
server.listen(PORT, () => {
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
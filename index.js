const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const multer = require('multer');
const passport = require('./config/passport');
const dbconnect = require('./config/dbconnect');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';
const { v4: uuidv4 } = require('uuid');
const socketIO = require('socket.io');


// Initialize Express
const app = express();

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
    'https://sport64sqrs.vercel.app'
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

// Check if all routes are valid Express routers before using them
// Routes
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/users/verification', verificationRoutes);
// app.use('/api/admin', adminRoutes);
app.use('/api/puzzles', puzzleRoutes);
app.use('/api', adminDashboard);

// app.use('/api/admin/puzzles', adminPuzzleRoutes);

// Setup Socket.io
const server = require('http').createServer(app);
const io = socketIO(server, {
  cors: corsOptions
});

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


// Store active chess games in memory
// In a production environment, you'd want to use a database
const activeGames = {};

// Chess Socket.IO handlers
io.on('connection', socket => {
  console.log('New socket connection:', socket.id);

  let currentGameCode = null;

  // Handle chess moves
  socket.on('chess:move', (data) => {
    const { gameCode, move } = data;
    console.log(`Move in game ${gameCode}:`, move);
    
    if (activeGames[gameCode]) {
      // Store the move in game history
      activeGames[gameCode].moves.push(move);
      
      // Broadcast the move to all players in the game
      io.to(gameCode).emit('chess:newMove', move);
    }
  });
  
  // Handle joining a game
  socket.on('chess:joinGame', (data) => {
    const { gameCode, playerColor } = data;
    currentGameCode = gameCode;
    
    socket.join(gameCode);
    
    if (activeGames[gameCode]) {
      // Add player to the game
      if (playerColor === 'white') {
        activeGames[gameCode].whitePlayer = socket.id;
      } else if (playerColor === 'black') {
        activeGames[gameCode].blackPlayer = socket.id;
      }
      
      // Check if both players are connected to start the game
      if (activeGames[gameCode].whitePlayer && activeGames[gameCode].blackPlayer) {
        io.to(gameCode).emit('chess:startGame');
      }
      
      // Send current game state to the newly joined player
      socket.emit('chess:gameState', {
        moves: activeGames[gameCode].moves,
        whiteConnected: !!activeGames[gameCode].whitePlayer,
        blackConnected: !!activeGames[gameCode].blackPlayer
      });
    }
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    
    if (currentGameCode && activeGames[currentGameCode]) {
      const game = activeGames[currentGameCode];
      
      // Determine which player disconnected
      if (game.whitePlayer === socket.id) {
        game.whitePlayer = null;
        game.whiteDisconnected = true;
      } else if (game.blackPlayer === socket.id) {
        game.blackPlayer = null;
        game.blackDisconnected = true;
      }
      
      // Notify other players about the disconnection
      io.to(currentGameCode).emit('chess:playerDisconnected', {
        whiteConnected: !!game.whitePlayer,
        blackConnected: !!game.blackPlayer
      });
      
      // If both players disconnected, clean up the game after some time
      if (!game.whitePlayer && !game.blackPlayer) {
        setTimeout(() => {
          if (activeGames[currentGameCode] && 
              !activeGames[currentGameCode].whitePlayer && 
              !activeGames[currentGameCode].blackPlayer) {
            delete activeGames[currentGameCode];
            console.log(`Game ${currentGameCode} removed due to inactivity`);
          }
        }, 3600000); // Remove after 1 hour of inactivity
      }
    }
  });
});

// API Routes for Chess

// Create a new chess game
app.post('/api/chess/create', (req, res) => {
  const gameCode = req.body.gameCode || uuidv4();
  
  // Check if game code already exists
  if (activeGames[gameCode]) {
    return res.status(400).json({
      success: false,
      message: 'Game code already in use'
    });
  }
  
  // Create a new game
  activeGames[gameCode] = {
    whitePlayer: null,
    blackPlayer: null,
    moves: [],
    createdAt: new Date()
  };
  
  res.json({
    success: true,
    gameCode: gameCode,
    message: 'Game created successfully'
  });
});

// Join a chess game
app.post('/api/chess/join', (req, res) => {
  const { gameCode } = req.body;
  
  if (!gameCode || !activeGames[gameCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game not found'
    });
  }
  
  const game = activeGames[gameCode];
  
  // Determine available colors
  const whiteAvailable = !game.whitePlayer || game.whiteDisconnected;
  const blackAvailable = !game.blackPlayer || game.blackDisconnected;
  
  res.json({
    success: true,
    gameCode: gameCode,
    whiteAvailable,
    blackAvailable,
    activeGame: true
  });
});

// Get current game state
app.get('/api/chess/state/:gameCode', (req, res) => {
  const { gameCode } = req.params;
  
  if (!activeGames[gameCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game not found'
    });
  }
  
  const game = activeGames[gameCode];
  
  res.json({
    success: true,
    gameCode,
    moves: game.moves,
    whiteConnected: !!game.whitePlayer,
    blackConnected: !!game.blackPlayer
  });
});

// Make a move (fallback for clients without WebSocket support)
app.post('/api/chess/move', (req, res) => {
  const { gameCode, move } = req.body;
  
  if (!activeGames[gameCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game not found'
    });
  }
  
  // Store the move
  activeGames[gameCode].moves.push(move);
  
  // Note: in a real implementation, you would validate the move here
  
  res.json({
    success: true,
    move,
    gameState: activeGames[gameCode]
  });
});

// List active games (could be restricted to admin in production)
app.get('/api/chess/active', (req, res) => {
  const games = Object.keys(activeGames).map(gameCode => ({
    gameCode,
    whiteConnected: !!activeGames[gameCode].whitePlayer,
    blackConnected: !!activeGames[gameCode].blackPlayer,
    moveCount: activeGames[gameCode].moves.length,
    createdAt: activeGames[gameCode].createdAt
  }));
  
  res.json({
    success: true,
    gameCount: games.length,
    games
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
    },
    routes: [
      { method: 'POST', path: '/api/chess/create', description: 'Create a new game' },
      { method: 'POST', path: '/api/chess/join', description: 'Join an existing game' },
      { method: 'GET', path: '/api/chess/state/:gameCode', description: 'Get game state' },
      { method: 'POST', path: '/api/chess/move', description: 'Make a move (REST fallback)' },
      { method: 'GET', path: '/api/chess/active', description: 'List active games' }
    ],
    socketEvents: [
      { event: 'chess:joinGame', direction: 'client→server', description: 'Join a game room' },
      { event: 'chess:move', direction: 'client→server', description: 'Make a move' },
      { event: 'chess:startGame', direction: 'server→client', description: 'Game started' },
      { event: 'chess:newMove', direction: 'server→client', description: 'New move broadcast' },
      { event: 'chess:playerDisconnected', direction: 'server→client', description: 'Player disconnected' },
      { event: 'chess:gameState', direction: 'server→client', description: 'Current game state' }
    ]
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
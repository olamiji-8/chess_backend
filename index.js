// server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const socketIO = require('socket.io');
require('dotenv').config();

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure CORS for both Express and Socket.IO
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Initialize Socket.IO with CORS settings
const io = socketIO(server, {
  cors: corsOptions
});

// Middleware
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

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

// Home route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Chess API Server',
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Chess server running on port ${PORT}`);
  console.log(`CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

module.exports = { app, server };
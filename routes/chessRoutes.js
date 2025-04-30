// chessRoutes.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid'); // You'll need to install this: npm install uuid

// Store active chess games in memory
// In a production environment, you'd want to use a database
const activeGames = {};

// This function will be called from your server.js to initialize socket.io functionality
function initChessSocketIO(io) {
    io.on('connection', socket => {
        console.log('New chess socket connection:', socket.id);

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
            console.log('Chess socket disconnected:', socket.id);
            
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
}

// API Routes for Chess

// Create a new chess game
router.post('/create', (req, res) => {
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
router.post('/join', (req, res) => {
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
router.get('/state/:gameCode', (req, res) => {
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
router.post('/move', (req, res) => {
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
router.get('/active', (req, res) => {
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

module.exports = {
    router,
    initChessSocketIO
};
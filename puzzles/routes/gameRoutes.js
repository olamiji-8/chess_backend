// Routes for game-related endpoints
const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// Create a new game
router.post('/', gameController.createGame);

// Get game details
router.get('/:gameId', gameController.getGameDetails);

// Make a move in the game
router.post('/:gameId/move', gameController.makeMove);

// Resign from a game
router.post('/:gameId/resign', gameController.resignGame);

// Get active games for user
router.get('/user/:userId/active', gameController.getUserActiveGames);

// Get user's game history
router.get('/user/:userId/history', gameController.getUserGameHistory);

// Find opponent by username
router.get('/opponent/find', gameController.findOpponent);

// Get online users for matchmaking
router.get('/online/:userId', gameController.getOnlineUsers);

module.exports = router;
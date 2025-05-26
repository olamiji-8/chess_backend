const express = require('express');
const router = express.Router();
const puzzleController = require('../controllers/puzzleController');

// Get a puzzle for the user
router.get('/:userId', puzzleController.getPuzzle);

// Get a hint for a puzzle
router.get('/hints/:attemptId', puzzleController.getHint);

// Submit a move for a puzzle
router.post('/move/:attemptId', puzzleController.submitMove);

// End puzzle attempt (give up or time's up)
router.post('/end/:attemptId', puzzleController.endPuzzleAttempt);

// Create a new puzzle (admin only)
router.post('/create', puzzleController.createPuzzle);

module.exports = router;

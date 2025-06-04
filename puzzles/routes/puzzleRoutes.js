const express = require('express');
const router = express.Router();
const puzzleController = require('../controllers/puzzleController');

// === Daily Puzzle Routes (Main Flow) ===

// Get today's puzzle for the user (auto-generated)
router.get('/:userId', puzzleController.getTodaysPuzzle);

// Get a hint for a puzzle attempt
router.get('/hints/:attemptId', puzzleController.getHint);

// Submit a move for a puzzle attempt
router.post('/move/:attemptId', puzzleController.submitMove);

// End puzzle attempt (give up or time's up)
router.post('/end/:attemptId', puzzleController.endPuzzleAttempt);

// === User Statistics Routes ===

// Get user's puzzle statistics and performance
router.get('/stats/:userId', puzzleController.getPuzzleStats);

// === System Management Routes ===

// Clean up old generated puzzles (for cron jobs or admin)
router.delete('/cleanup', puzzleController.cleanupOldPuzzles);

// === Legacy/Compatibility Routes (if needed) ===

// Redirect old puzzle route to new daily puzzle route
router.get('/:userId', (req, res) => {
  res.redirect(`/puzzles/daily/${req.params.userId}${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`);
});

module.exports = router;
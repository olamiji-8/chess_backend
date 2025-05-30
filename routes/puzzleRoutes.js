const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { check, validationResult } = require('express-validator');
const puzzleController = require('../controllers/puzzleController');

// @route   GET /api/puzzles/daily
// @desc    Get a daily puzzle based on difficulty
// @access  Private
router.get('/daily', protect, puzzleController.getDailyPuzzle);

// @route   POST /api/puzzles/attempt
// @desc    Submit a puzzle solution attempt
// @access  Private
router.post('/attempt', [
  protect,
  [
    check('puzzleId', 'Puzzle ID is required').not().isEmpty(),
    check('move', 'Move is required').not().isEmpty()
  ]
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  puzzleController.attemptPuzzle(req, res);
});

// @route   GET /api/puzzles/hint/:id
// @desc    Get a hint for a puzzle
// @access  Private
router.get('/hint/:puzzleId', protect, puzzleController.getPuzzleHint);

// @route   GET /api/puzzles/solution/:id
// @desc    Get the solution for a puzzle
// @access  Private
router.get('/solution/:id', protect, puzzleController.getPuzzleSolution);

// @route   GET /api/puzzles/progress
// @desc    Get user's puzzle progress and streak
// @access  Private
router.get('/progress', protect, puzzleController.getUserProgress);

// @route   POST /api/puzzles/redeem
// @desc    Redeem tokens for rewards
// @access  Private
router.post('/redeem', [
  protect,
  [
    check('rewardId', 'Reward ID is required').not().isEmpty()
  ]
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  puzzleController.redeemTokens(req, res);
});

module.exports = router;

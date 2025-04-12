const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { check, validationResult } = require('express-validator');
const ChessPuzzle = require('../models/ChessPuzzle');

// @route   GET /api/admin/puzzles
// @desc    Get all puzzles with pagination
// @access  Admin
router.get('/puzzles', [auth, admin], async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const totalPuzzles = await ChessPuzzle.countDocuments();
    const puzzles = await ChessPuzzle.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    res.json({
      puzzles,
      totalPages: Math.ceil(totalPuzzles / limit),
      currentPage: page
    });
  } catch (err) {
    console.error('Error fetching puzzles:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/admin/puzzles
// @desc    Create a new puzzle
// @access  Admin
router.post('/puzzles', [
  auth,
  admin,
  [
    check('fen', 'FEN position is required').not().isEmpty(),
    check('solution', 'Solution moves are required').isArray().not().isEmpty(),
    check('difficulty', 'Valid difficulty is required').isIn(['easy', 'intermediate', 'hard'])
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { fen, solution, difficulty, description, tags } = req.body;
    
    const newPuzzle = new ChessPuzzle({
      fen,
      solution,
      difficulty,
      description,
      tags
    });
    
    const puzzle = await newPuzzle.save();
    res.json(puzzle);
  } catch (err) {
    console.error('Error creating puzzle:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   PUT /api/admin/puzzles/:id
// @desc    Update a puzzle
// @access  Admin
router.put('/puzzles/:id', [auth, admin], async (req, res) => {
  try {
    const { fen, solution, difficulty, description, tags } = req.body;
    
    let puzzle = await ChessPuzzle.findById(req.params.id);
    
    if (!puzzle) {
      return res.status(404).json({ msg: 'Puzzle not found' });
    }
    
    const updatedPuzzle = {
      fen: fen || puzzle.fen,
      solution: solution || puzzle.solution,
      difficulty: difficulty || puzzle.difficulty,
      description: description !== undefined ? description : puzzle.description,
      tags: tags !== undefined ? tags : puzzle.tags
    };
    
    puzzle = await ChessPuzzle.findByIdAndUpdate(
      req.params.id,
      { $set: updatedPuzzle },
      { new: true }
    );
    
    res.json(puzzle);
  } catch (err) {
    console.error('Error updating puzzle:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   DELETE /api/admin/puzzles/:id
// @desc    Delete a puzzle
// @access  Admin
router.delete('/puzzles/:id', [auth, admin], async (req, res) => {
  try {
    const puzzle = await ChessPuzzle.findById(req.params.id);
    
    if (!puzzle) {
      return res.status(404).json({ msg: 'Puzzle not found' });
    }
    
    await puzzle.remove();
    
    res.json({ msg: 'Puzzle removed' });
  } catch (err) {
    console.error('Error deleting puzzle:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/admin/puzzles/batch
// @desc    Add multiple puzzles at once
// @access  Admin
router.post('/puzzles/batch', [auth, admin], async (req, res) => {
  try {
    const { puzzles } = req.body;
    
    if (!puzzles || !Array.isArray(puzzles) || puzzles.length === 0) {
      return res.status(400).json({ msg: 'No puzzles provided' });
    }
    
    const insertedPuzzles = await ChessPuzzle.insertMany(puzzles);
    
    res.json({
      count: insertedPuzzles.length,
      puzzles: insertedPuzzles
    });
  } catch (err) {
    console.error('Error adding batch puzzles:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
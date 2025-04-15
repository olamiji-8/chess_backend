const ChessPuzzle = require('../models/Puzzle');
const Reward = require('../models/Reward');

// Get all puzzles with pagination
exports.getAllPuzzles = async (req, res) => {
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
};

// Create a new puzzle
exports.createPuzzle = async (req, res) => {
  try {
    const { fen, solution, difficulty, description, hints, tags } = req.body;
    
    const newPuzzle = new ChessPuzzle({
      fen,
      solution,
      difficulty,
      description,
      hints,
      tags
    });
    
    const puzzle = await newPuzzle.save();
    res.json(puzzle);
  } catch (err) {
    console.error('Error creating puzzle:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Update a puzzle
exports.updatePuzzle = async (req, res) => {
  try {
    const { fen, solution, difficulty, description, hints, tags } = req.body;
    
    let puzzle = await ChessPuzzle.findById(req.params.id);
    
    if (!puzzle) {
      return res.status(404).json({ msg: 'Puzzle not found' });
    }
    
    const updatedPuzzle = {
      fen: fen || puzzle.fen,
      solution: solution || puzzle.solution,
      difficulty: difficulty || puzzle.difficulty,
      description: description !== undefined ? description : puzzle.description,
      hints: hints !== undefined ? hints : puzzle.hints,
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
};

// Delete a puzzle
exports.deletePuzzle = async (req, res) => {
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
};

// Add multiple puzzles at once
exports.addBatchPuzzles = async (req, res) => {
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
};

// Get reward milestones
exports.getRewards = async (req, res) => {
  try {
    const rewards = await Reward.find().sort({ streakMilestone: 1 });
    res.json(rewards);
  } catch (err) {
    console.error('Error getting rewards:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Create/update a reward milestone
exports.upsertReward = async (req, res) => {
  try {
    const { streakMilestone, tokenAmount, description } = req.body;
    
    let reward = await Reward.findOne({ streakMilestone });
    
    if (reward) {
      // Update existing
      reward.tokenAmount = tokenAmount;
      reward.description = description;
      await reward.save();
    } else {
      // Create new
      reward = new Reward({
        streakMilestone,
        tokenAmount,
        description
      });
      await reward.save();
    }
    
    res.json(reward);
  } catch (err) {
    console.error('Error managing reward:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

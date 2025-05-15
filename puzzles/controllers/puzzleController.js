const Puzzle = require('../models/puzzleModel');
const User = require('../models/userModel');
const PuzzleAttempt = require('../models/puzzleAttemptModel');
const mongoose = require('mongoose');

// Get a puzzle for the user
exports.getPuzzle = async (req, res) => {
  try {
    const { userId } = req.params;
    const { difficulty = 'beginner' } = req.query;
    
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if user can play puzzle today
    if (!user.canPlayPuzzleToday()) {
      const nextPuzzleTime = new Date(user.lastPuzzleDate);
      nextPuzzleTime.setHours(nextPuzzleTime.getHours() + 24);
      
      return res.status(403).json({
        message: 'You have already played a puzzle today',
        nextAvailableAt: nextPuzzleTime,
        canPlayPuzzle: false
      });
    }
    
    // Find an appropriate puzzle based on difficulty
    const puzzle = await Puzzle.findOne({ difficulty }).sort({ 'createdAt': -1 });
    
    if (!puzzle) {
      return res.status(404).json({ message: 'No puzzles available for the selected difficulty' });
    }
    
    // Create a new puzzle attempt
    const puzzleAttempt = new PuzzleAttempt({
      user: userId,
      puzzle: puzzle._id,
      startedAt: new Date()
    });
    
    await puzzleAttempt.save();
    
    // Return puzzle details without solution
    res.status(200).json({
      puzzleAttemptId: puzzleAttempt._id,
      fen: puzzle.fen,
      difficulty: puzzle.difficulty,
      objective: puzzle.objective,
      timeLimit: puzzle.timeLimit
    });
    
  } catch (error) {
    console.error('Error in getPuzzle:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get a hint for puzzle
exports.getHint = async (req, res) => {
  try {
    const { attemptId } = req.params;
    
    // Find the puzzle attempt
    const puzzleAttempt = await PuzzleAttempt.findById(attemptId).populate('puzzle');
    
    if (!puzzleAttempt) {
      return res.status(404).json({ message: 'Puzzle attempt not found' });
    }
    
    // Update attempt to indicate hint was used
    puzzleAttempt.usedHint = true;
    await puzzleAttempt.save();
    
    // Return the hint
    res.status(200).json({
      hint: puzzleAttempt.puzzle.hint,
      usedHint: true
    });
    
  } catch (error) {
    console.error('Error in getHint:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Submit a move for puzzle
exports.submitMove = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { move } = req.body;
    
    if (!move) {
      return res.status(400).json({ message: 'Move is required' });
    }
    
    // Find the puzzle attempt
    const puzzleAttempt = await PuzzleAttempt.findById(attemptId).populate('puzzle user');
    
    if (!puzzleAttempt) {
      return res.status(404).json({ message: 'Puzzle attempt not found' });
    }
    
    // If puzzle is already completed, return
    if (puzzleAttempt.completed) {
      return res.status(403).json({ message: 'This puzzle attempt is already completed' });
    }
    
    // Get the current move index
    const moveIndex = puzzleAttempt.moves.length;
    
    // Check if the move matches the expected solution move
    const isCorrect = puzzleAttempt.puzzle.solution[moveIndex] === move;
    
    // Record the move
    puzzleAttempt.moves.push({
      move,
      timestamp: new Date()
    });
    
    // If incorrect move
    if (!isCorrect) {
      puzzleAttempt.completed = true;
      puzzleAttempt.successful = false;
      puzzleAttempt.completedAt = new Date();
      await puzzleAttempt.save();
      
      return res.status(200).json({
        correct: false,
        completed: true,
        successful: false,
        message: 'Incorrect move. Puzzle failed.'
      });
    }
    
    // If this was the last move in the solution
    if (moveIndex === puzzleAttempt.puzzle.solution.length - 1) {
      // Calculate time spent
      const endTime = new Date();
      const timeSpent = Math.round((endTime - puzzleAttempt.startedAt) / 1000); // in seconds
      
      puzzleAttempt.completed = true;
      puzzleAttempt.successful = true;
      puzzleAttempt.completedAt = endTime;
      puzzleAttempt.timeSpent = timeSpent;
      
      // Calculate points earned (no points if hint was used)
      if (!puzzleAttempt.usedHint && timeSpent <= puzzleAttempt.puzzle.timeLimit) {
        puzzleAttempt.pointsEarned = puzzleAttempt.puzzle.points;
        
        // Update user points and streak
        puzzleAttempt.user.points += puzzleAttempt.puzzle.points;
        puzzleAttempt.user.updateStreak();
        puzzleAttempt.user.lastPuzzleDate = new Date();
        await puzzleAttempt.user.save();
      }
      
      await puzzleAttempt.save();
      
      const nextPuzzleTime = new Date();
      nextPuzzleTime.setHours(nextPuzzleTime.getHours() + 24);
      
      return res.status(200).json({
        correct: true,
        completed: true,
        successful: true,
        usedHint: puzzleAttempt.usedHint,
        pointsEarned: puzzleAttempt.pointsEarned,
        timeSpent,
        message: 'Puzzle completed successfully!',
        nextPuzzleAvailableAt: nextPuzzleTime,
        streak: puzzleAttempt.user.streak
      });
    }
    
    // Not completed yet, expect next move
    await puzzleAttempt.save();
    
    // Get the next computer's move to respond
    const nextMove = puzzleAttempt.puzzle.solution[moveIndex + 1];
    
    return res.status(200).json({
      correct: true,
      completed: false,
      nextMove
    });
    
  } catch (error) {
    console.error('Error in submitMove:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Complete the puzzle attempt (giving up or time's up)
exports.endPuzzleAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { reason = 'user_quit' } = req.body; // 'user_quit', 'time_up'
    
    // Find the puzzle attempt
    const puzzleAttempt = await PuzzleAttempt.findById(attemptId).populate('user puzzle');
    
    if (!puzzleAttempt) {
      return res.status(404).json({ message: 'Puzzle attempt not found' });
    }
    
    // If already completed, return
    if (puzzleAttempt.completed) {
      return res.status(403).json({ message: 'This puzzle attempt is already completed' });
    }
    
    // Mark as completed but not successful
    puzzleAttempt.completed = true;
    puzzleAttempt.successful = false;
    puzzleAttempt.completedAt = new Date();
    puzzleAttempt.timeSpent = Math.round((puzzleAttempt.completedAt - puzzleAttempt.startedAt) / 1000);
    
    // Update user's last puzzle date
    puzzleAttempt.user.lastPuzzleDate = new Date();
    await puzzleAttempt.user.save();
    
    await puzzleAttempt.save();
    
    const nextPuzzleTime = new Date();
    nextPuzzleTime.setHours(nextPuzzleTime.getHours() + 24);
    
    res.status(200).json({
      message: reason === 'time_up' ? 'Time\'s up! Puzzle failed.' : 'Puzzle abandoned.',
      completed: true,
      successful: false,
      nextPuzzleAvailableAt: nextPuzzleTime
    });
    
  } catch (error) {
    console.error('Error in endPuzzleAttempt:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create a new puzzle (admin only)
exports.createPuzzle = async (req, res) => {
  try {
    const { fen, difficulty, objective, solution, hint, timeLimit } = req.body;
    
    // Validation
    if (!fen || !difficulty || !objective || !solution || !hint) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Create new puzzle
    const puzzle = new Puzzle({
      fen,
      difficulty,
      objective,
      solution: Array.isArray(solution) ? solution : [solution],
      hint,
      timeLimit: timeLimit || undefined
    });
    
    await puzzle.save();
    
    res.status(201).json({
      message: 'Puzzle created successfully',
      puzzle: {
        id: puzzle._id,
        fen: puzzle.fen,
        difficulty: puzzle.difficulty,
        objective: puzzle.objective,
        solution: puzzle.solution,
        hint: puzzle.hint,
        timeLimit: puzzle.timeLimit,
        points: puzzle.points
      }
    });
    
  } catch (error) {
    console.error('Error in createPuzzle:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
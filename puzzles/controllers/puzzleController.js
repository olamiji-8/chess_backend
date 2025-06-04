const Puzzle = require('../models/puzzleModel');
const User = require('../models/userModel');
const PuzzleAttempt = require('../models/puzzleAttemptModel');
const mongoose = require('mongoose');

// Puzzle generation service - you can replace this with actual chess puzzle generation logic
const generatePuzzleForUser = (userId, difficulty) => {
  // This is a mock implementation - replace with actual puzzle generation
  const puzzleBank = {
    beginner: [
      {
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        objective: "Find the best move for Black",
        solution: ["e7e5", "Ng1f3", "Nb8c6"],
        hint: "Control the center with your pawn",
        timeLimit: 300
      },
      {
        fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
        objective: "Develop your pieces",
        solution: ["Bf1c4", "f7f5", "d2d3"],
        hint: "Develop your bishop to an active square",
        timeLimit: 300
      }
    ],
    intermediate: [
      {
        fen: "r2qkb1r/ppp2ppp/2n1bn2/4p3/4P3/3P1N2/PPP2PPP/RNBQKB1R w KQkq - 4 6",
        objective: "Find the tactical shot",
        solution: ["Nf3d4", "Bc8d7", "Nd4f5"],
        hint: "Look for a knight fork opportunity",
        timeLimit: 600
      }
    ],
    advanced: [
      {
        fen: "r1bq1rk1/pp2nppp/2n1p3/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R b KQ - 1 8",
        objective: "Find the winning combination",
        solution: ["Nc6d4", "Ne3d5", "e6d5"],
        hint: "Sacrifice to open up the position",
        timeLimit: 900
      }
    ]
  };

  const puzzles = puzzleBank[difficulty] || puzzleBank.beginner;
  const randomIndex = Math.floor(Math.random() * puzzles.length);
  const selectedPuzzle = puzzles[randomIndex];

  // Create a unique puzzle for this user by adding user-specific variation
  const userSeed = userId.toString().slice(-2); // Last 2 chars of userId
  const variation = parseInt(userSeed, 16) % puzzles.length;
  
  return {
    ...selectedPuzzle,
    // Add some user-specific randomization to make each puzzle unique
    generatedFor: userId,
    generatedAt: new Date(),
    points: difficulty === 'beginner' ? 10 : difficulty === 'intermediate' ? 20 : 30
  };
};

// Get today's puzzle for the user (auto-generated)
exports.getTodaysPuzzle = async (req, res) => {
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
      nextPuzzleTime.setDate(nextPuzzleTime.getDate() + 1);
      nextPuzzleTime.setHours(0, 0, 0, 0); // Reset to start of next day
      
      return res.status(403).json({
        message: 'You have already played today\'s puzzle',
        nextAvailableAt: nextPuzzleTime,
        canPlayPuzzle: false
      });
    }
    
    // Generate today's date key for puzzle uniqueness
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Check if there's already a puzzle attempt for today
    const existingAttempt = await PuzzleAttempt.findOne({
      user: userId,
      dateKey: dateKey,
      completed: false
    }).populate('puzzle');
    
    if (existingAttempt) {
      // Return the existing ongoing puzzle
      return res.status(200).json({
        puzzleAttemptId: existingAttempt._id,
        fen: existingAttempt.puzzle.fen,
        difficulty: existingAttempt.puzzle.difficulty,
        objective: existingAttempt.puzzle.objective,
        timeLimit: existingAttempt.puzzle.timeLimit,
        movesPlayed: existingAttempt.moves.length,
        startedAt: existingAttempt.startedAt,
        usedHint: existingAttempt.usedHint
      });
    }
    
    // Generate a new puzzle for this user
    const puzzleData = generatePuzzleForUser(userId, difficulty);
    
    // Create and save the generated puzzle
    const puzzle = new Puzzle({
      ...puzzleData,
      difficulty,
      createdFor: userId,
      dateKey: dateKey,
      isGenerated: true
    });
    
    await puzzle.save();
    
    // Create a new puzzle attempt
    const puzzleAttempt = new PuzzleAttempt({
      user: userId,
      puzzle: puzzle._id,
      dateKey: dateKey,
      startedAt: new Date()
    });
    
    await puzzleAttempt.save();
    
    // Return puzzle details without solution
    res.status(200).json({
      puzzleAttemptId: puzzleAttempt._id,
      fen: puzzle.fen,
      difficulty: puzzle.difficulty,
      objective: puzzle.objective,
      timeLimit: puzzle.timeLimit,
      isNewPuzzle: true
    });
    
  } catch (error) {
    console.error('Error in getTodaysPuzzle:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get a hint for puzzle
exports.getHint = async (req, res) => {
  try {
    const { attemptId } = req.params;
    
    // Validate the attemptId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ 
        message: 'Invalid puzzle attempt ID format',
        error: 'The provided ID is not a valid MongoDB ObjectId'
      });
    }
    
    // Find the puzzle attempt
    const puzzleAttempt = await PuzzleAttempt.findById(attemptId).populate('puzzle');
    
    if (!puzzleAttempt) {
      return res.status(404).json({ message: 'Puzzle attempt not found' });
    }
    
    // Check if puzzle is still active
    if (puzzleAttempt.completed) {
      return res.status(403).json({ message: 'Cannot get hint for completed puzzle' });
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
    
    // Check if time limit exceeded
    const currentTime = new Date();
    const timeElapsed = Math.round((currentTime - puzzleAttempt.startedAt) / 1000);
    if (timeElapsed > puzzleAttempt.puzzle.timeLimit) {
      // Auto-complete as failed due to timeout
      puzzleAttempt.completed = true;
      puzzleAttempt.successful = false;
      puzzleAttempt.completedAt = currentTime;
      puzzleAttempt.timeSpent = timeElapsed;
      
      // Update user's last puzzle date
      puzzleAttempt.user.lastPuzzleDate = new Date();
      await puzzleAttempt.user.save();
      await puzzleAttempt.save();
      
      return res.status(200).json({
        correct: false,
        completed: true,
        successful: false,
        message: 'Time limit exceeded. Puzzle failed.',
        timeSpent: timeElapsed
      });
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
      puzzleAttempt.timeSpent = Math.round((puzzleAttempt.completedAt - puzzleAttempt.startedAt) / 1000);
      
      // Update user's last puzzle date
      puzzleAttempt.user.lastPuzzleDate = new Date();
      await puzzleAttempt.user.save();
      await puzzleAttempt.save();
      
      return res.status(200).json({
        correct: false,
        completed: true,
        successful: false,
        message: 'Incorrect move. Puzzle failed.',
        correctMove: puzzleAttempt.puzzle.solution[moveIndex]
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
      
      // Calculate points earned (no points if hint was used or time exceeded)
      if (!puzzleAttempt.usedHint && timeSpent <= puzzleAttempt.puzzle.timeLimit) {
        puzzleAttempt.pointsEarned = puzzleAttempt.puzzle.points;
        
        // Update user points and streak
        puzzleAttempt.user.points += puzzleAttempt.puzzle.points;
        puzzleAttempt.user.updateStreak();
      }
      
      // Update user's last puzzle date
      puzzleAttempt.user.lastPuzzleDate = new Date();
      await puzzleAttempt.user.save();
      await puzzleAttempt.save();
      
      return res.status(200).json({
        correct: true,
        completed: true,
        successful: true,
        usedHint: puzzleAttempt.usedHint,
        pointsEarned: puzzleAttempt.pointsEarned || 0,
        timeSpent,
        message: 'Puzzle completed successfully!',
        streak: puzzleAttempt.user.streak
      });
    }
    
    // Not completed yet, expect next move
    await puzzleAttempt.save();
    
    // Get the next computer's move to respond (if it exists)
    let nextMove = null;
    if (moveIndex + 1 < puzzleAttempt.puzzle.solution.length) {
      nextMove = puzzleAttempt.puzzle.solution[moveIndex + 1];
    }
    
    return res.status(200).json({
      correct: true,
      completed: false,
      nextMove,
      movesRemaining: puzzleAttempt.puzzle.solution.length - moveIndex - 1
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
    
    res.status(200).json({
      message: reason === 'time_up' ? 'Time\'s up! Puzzle failed.' : 'Puzzle abandoned.',
      completed: true,
      successful: false,
      solution: puzzleAttempt.puzzle.solution
    });
    
  } catch (error) {
    console.error('Error in endPuzzleAttempt:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user's puzzle statistics
exports.getPuzzleStats = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get puzzle attempt statistics
    const stats = await PuzzleAttempt.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          successfulAttempts: { $sum: { $cond: ['$successful', 1, 0] } },
          totalPoints: { $sum: '$pointsEarned' },
          averageTime: { $avg: '$timeSpent' },
          hintsUsed: { $sum: { $cond: ['$usedHint', 1, 0] } }
        }
      }
    ]);
    
    const puzzleStats = stats[0] || {
      totalAttempts: 0,
      successfulAttempts: 0,
      totalPoints: 0,
      averageTime: 0,
      hintsUsed: 0
    };
    
    const successRate = puzzleStats.totalAttempts > 0 
      ? Math.round((puzzleStats.successfulAttempts / puzzleStats.totalAttempts) * 100)
      : 0;
    
    res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        points: user.points,
        streak: user.streak,
        canPlayToday: user.canPlayPuzzleToday()
      },
      puzzleStats: {
        ...puzzleStats,
        successRate,
        averageTime: Math.round(puzzleStats.averageTime || 0)
      }
    });
    
  } catch (error) {
    console.error('Error in getPuzzleStats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Clean up old generated puzzles (run this as a daily cron job)
exports.cleanupOldPuzzles = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Delete old generated puzzles and their attempts
    const deletedPuzzles = await Puzzle.deleteMany({
      isGenerated: true,
      createdAt: { $lt: thirtyDaysAgo }
    });
    
    const deletedAttempts = await PuzzleAttempt.deleteMany({
      createdAt: { $lt: thirtyDaysAgo }
    });
    
    res.status(200).json({
      message: 'Cleanup completed',
      deletedPuzzles: deletedPuzzles.deletedCount,
      deletedAttempts: deletedAttempts.deletedCount
    });
    
  } catch (error) {
    console.error('Error in cleanupOldPuzzles:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
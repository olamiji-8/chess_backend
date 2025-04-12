const ChessPuzzle = require('../models/Puzzle');
const UserPuzzleProgress = require('../models/UserPuzzle');
const { Chess } = require('chess.js');

// Get a random puzzle based on difficulty
exports.getDailyPuzzle = async (req, res) => {
  try {
    const { difficulty = 'intermediate' } = req.query;
    
    // Count puzzles with the given difficulty
    const count = await ChessPuzzle.countDocuments({ difficulty });
    
    if (count === 0) {
      return res.status(404).json({ msg: 'No puzzles found for this difficulty' });
    }
    
    // Get a random puzzle
    const random = Math.floor(Math.random() * count);
    const puzzle = await ChessPuzzle.findOne({ difficulty }).skip(random);
    
    // Return only necessary information (no solution)
    const puzzleData = {
      _id: puzzle._id,
      fen: puzzle.fen,
      difficulty: puzzle.difficulty,
      description: puzzle.description || 'Find the best move'
    };
    
    res.json(puzzleData);
  } catch (err) {
    console.error('Error getting puzzle:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Submit a puzzle solution attempt
exports.attemptPuzzle = async (req, res) => {
  try {
    const { puzzleId, move } = req.body;
    const userId = req.user.id;
    
    // Find the puzzle
    const puzzle = await ChessPuzzle.findById(puzzleId);
    if (!puzzle) {
      return res.status(404).json({ msg: 'Puzzle not found' });
    }
    
    // Check if the move is correct
    const isCorrect = puzzle.solution[0] === move;
    
    // Get or create user progress
    let userProgress = await UserPuzzleProgress.findOne({ user: userId });
    if (!userProgress) {
      userProgress = new UserPuzzleProgress({ user: userId });
    }
    
    // Check if this puzzle is already in the user's history
    const puzzleHistoryIndex = userProgress.puzzleHistory.findIndex(
      p => p.puzzle.toString() === puzzleId
    );
    
    if (puzzleHistoryIndex === -1) {
      // This is a new puzzle attempt
      const puzzleEntry = {
        puzzle: puzzleId,
        solved: isCorrect,
        attempts: 1,
        date: Date.now()
      };
      userProgress.puzzleHistory.unshift(puzzleEntry);
      userProgress.puzzlesAttempted += 1;
    } else {
      // Update existing puzzle history
      userProgress.puzzleHistory[puzzleHistoryIndex].attempts += 1;
      
      if (isCorrect && !userProgress.puzzleHistory[puzzleHistoryIndex].solved) {
        userProgress.puzzleHistory[puzzleHistoryIndex].solved = true;
      }
    }
    
    // Update streak and stats if correct
    if (isCorrect) {
      // Calculate if the streak should be updated or reset
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const lastSolved = userProgress.lastSolvedDate ? new Date(userProgress.lastSolvedDate) : null;
      if (lastSolved) {
        lastSolved.setHours(0, 0, 0, 0);
      }
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
        
      // If last solved was yesterday, continue streak
      // If last solved was today, don't increment streak (already counted)
      // Otherwise, reset streak to 1
      if (!lastSolved) {
        userProgress.currentStreak = 1;
      } else if (lastSolved.getTime() === yesterday.getTime()) {
        userProgress.currentStreak += 1;
      } else if (lastSolved.getTime() !== today.getTime()) {
        userProgress.currentStreak = 1;
      }
      
      // Update best streak if needed
      if (userProgress.currentStreak > userProgress.bestStreak) {
        userProgress.bestStreak = userProgress.currentStreak;
      }
      
      // Update last solved date
      userProgress.lastSolvedDate = new Date();
      
      // Update puzzle stats
      userProgress.puzzlesSolved += 1;
      
      // Update difficulty-specific stats
      if (puzzle.difficulty === 'easy') {
        userProgress.easyPuzzlesSolved += 1;
      } else if (puzzle.difficulty === 'intermediate') {
        userProgress.intermediatePuzzlesSolved += 1;
      } else if (puzzle.difficulty === 'hard') {
        userProgress.hardPuzzlesSolved += 1;
      }
    }
    
    await userProgress.save();
    
    // Return result
    res.json({
      isCorrect,
      streak: userProgress.currentStreak,
      bestStreak: userProgress.bestStreak,
      puzzlesSolved: userProgress.puzzlesSolved,
      solution: isCorrect ? puzzle.solution : null // Only send solution if correct
    });
    
  } catch (err) {
    console.error('Error with puzzle attempt:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get the solution for a puzzle
exports.getPuzzleSolution = async (req, res) => {
  try {
    const puzzle = await ChessPuzzle.findById(req.params.id);
    
    if (!puzzle) {
      return res.status(404).json({ msg: 'Puzzle not found' });
    }
    
    res.json({ solution: puzzle.solution });
  } catch (err) {
    console.error('Error getting solution:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get user's puzzle progress and streak
exports.getUserProgress = async (req, res) => {
  try {
    const userProgress = await UserPuzzleProgress.findOne({ user: req.user.id });
    
    if (!userProgress) {
      return res.json({
        currentStreak: 0,
        bestStreak: 0,
        puzzlesAttempted: 0,
        puzzlesSolved: 0,
        easyPuzzlesSolved: 0,
        intermediatePuzzlesSolved: 0,
        hardPuzzlesSolved: 0
      });
    }
    
    res.json({
      currentStreak: userProgress.currentStreak,
      bestStreak: userProgress.bestStreak,
      puzzlesAttempted: userProgress.puzzlesAttempted,
      puzzlesSolved: userProgress.puzzlesSolved,
      easyPuzzlesSolved: userProgress.easyPuzzlesSolved,
      intermediatePuzzlesSolved: userProgress.intermediatePuzzlesSolved,
      hardPuzzlesSolved: userProgress.hardPuzzlesSolved
    });
  } catch (err) {
    console.error('Error getting user progress:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};
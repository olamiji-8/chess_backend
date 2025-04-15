const ChessPuzzle = require('../models/Puzzle');
const UserPuzzleProgress = require('../models/UserPuzzle');
const Reward = require('../models/Reward');
const { Chess } = require('chess.js');

// Get a puzzle based on difficulty - changes each time requested
exports.getDailyPuzzle = async (req, res) => {
  try {
    const { difficulty = 'intermediate' } = req.query;
    const userId = req.user.id;
    
    // Count puzzles with the given difficulty
    const count = await ChessPuzzle.countDocuments({ difficulty });
    
    if (count === 0) {
      return res.status(404).json({ msg: 'No puzzles found for this difficulty' });
    }
    
    // Find user progress to check last puzzle
    let userProgress = await UserPuzzleProgress.findOne({ user: userId });
    
    // Get a random puzzle that's different from the last one
    const random = Math.floor(Math.random() * count);
    let puzzle;
    
    if (userProgress && userProgress.lastPuzzle) {
      puzzle = await ChessPuzzle.findOne({ 
        difficulty, 
        _id: { $ne: userProgress.lastPuzzle } 
      }).skip(random);
    } else {
      puzzle = await ChessPuzzle.findOne({ difficulty }).skip(random);
    }
    
    // If no puzzle found (unlikely), get any puzzle of that difficulty
    if (!puzzle) {
      puzzle = await ChessPuzzle.findOne({ difficulty });
    }
    
    // Update user's last puzzle
    if (!userProgress) {
      userProgress = new UserPuzzleProgress({ user: userId });
    }
    userProgress.lastPuzzle = puzzle._id;
    await userProgress.save();
    
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
    
    // Var to track if this was the first attempt
    let firstAttempt = false;
    
    if (puzzleHistoryIndex === -1) {
      // This is a new puzzle attempt
      firstAttempt = true;
      const puzzleEntry = {
        puzzle: puzzleId,
        solved: isCorrect,
        attempts: 1,
        hintsUsed: false,
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
    
    // Check if hint should be provided (2+ attempts and not correct)
    let hint = null;
    if (!isCorrect && 
        puzzleHistoryIndex !== -1 && 
        userProgress.puzzleHistory[puzzleHistoryIndex].attempts >= 2 &&
        !userProgress.puzzleHistory[puzzleHistoryIndex].hintsUsed &&
        puzzle.hints && 
        puzzle.hints.length > 0) {
      
      hint = puzzle.hints[0];
      userProgress.puzzleHistory[puzzleHistoryIndex].hintsUsed = true;
    }
    
    // Update streak and stats if correct
    let rewardEarned = null;
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
      
      // Check for streak milestone rewards (every 5 days)
      if (userProgress.currentStreak % 5 === 0) {
        // Find applicable reward
        const reward = await Reward.findOne({ streakMilestone: userProgress.currentStreak });
        
        if (reward) {
          // Award tokens
          userProgress.tokens += reward.tokenAmount;
          rewardEarned = {
            streakMilestone: userProgress.currentStreak,
            tokenAmount: reward.tokenAmount,
            description: reward.description || `Streak milestone: ${userProgress.currentStreak} days`
          };
        } else {
          // Default reward if no specific one is defined
          const tokenAmount = Math.floor(userProgress.currentStreak / 5) * 5;
          userProgress.tokens += tokenAmount;
          rewardEarned = {
            streakMilestone: userProgress.currentStreak,
            tokenAmount: tokenAmount,
            description: `Streak milestone: ${userProgress.currentStreak} days`
          };
        }
      }
    }
    
    await userProgress.save();
    
    // Return result
    res.json({
      isCorrect,
      streak: userProgress.currentStreak,
      bestStreak: userProgress.bestStreak,
      puzzlesSolved: userProgress.puzzlesSolved,
      hint: hint,
      reward: rewardEarned,
      solution: isCorrect ? puzzle.solution : null, // Only send solution if correct
      tokens: userProgress.tokens
    });
    
  } catch (err) {
    console.error('Error with puzzle attempt:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Get a hint for a puzzle
exports.getPuzzleHint = async (req, res) => {
  try {
    const { puzzleId } = req.params;
    const userId = req.user.id;
    
    // Find the puzzle
    const puzzle = await ChessPuzzle.findById(puzzleId);
    if (!puzzle) {
      return res.status(404).json({ msg: 'Puzzle not found' });
    }
    
    // Check if user has attempted the puzzle at least twice
    const userProgress = await UserPuzzleProgress.findOne({ user: userId });
    if (!userProgress) {
      return res.status(400).json({ msg: 'Try solving the puzzle first' });
    }
    
    const puzzleAttempt = userProgress.puzzleHistory.find(
      p => p.puzzle.toString() === puzzleId
    );
    
    if (!puzzleAttempt) {
      return res.status(400).json({ msg: 'Try solving the puzzle first' });
    }
    
    if (puzzleAttempt.attempts < 2) {
      return res.status(400).json({ msg: 'Make at least two attempts before requesting a hint' });
    }
    
    if (puzzleAttempt.hintsUsed) {
      // User already got a hint
      if (puzzle.hints && puzzle.hints.length > 0) {
        return res.json({ hint: puzzle.hints[0] });
      }
    }
    
    // Mark hint as used
    puzzleAttempt.hintsUsed = true;
    await userProgress.save();
    
    // Return hint if available
    if (puzzle.hints && puzzle.hints.length > 0) {
      return res.json({ hint: puzzle.hints[0] });
    } else {
      // Generate a basic hint if none provided
      const chess = new Chess(puzzle.fen);
      const hint = `Look for a ${chess.turn() === 'w' ? 'white' : 'black'} piece that can create a tactical opportunity`;
      return res.json({ hint });
    }
  } catch (err) {
    console.error('Error getting hint:', err.message);
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
    
    // Update user history to mark puzzle as viewed
    const userId = req.user.id;
    const userProgress = await UserPuzzleProgress.findOne({ user: userId });
    
    if (userProgress) {
      const puzzleHistoryIndex = userProgress.puzzleHistory.findIndex(
        p => p.puzzle.toString() === req.params.id
      );
      
      if (puzzleHistoryIndex !== -1) {
        // Mark in history that they viewed the solution
        userProgress.puzzleHistory[puzzleHistoryIndex].viewedSolution = true;
        await userProgress.save();
      }
    }
    
    res.json({ 
      solution: puzzle.solution,
      description: puzzle.description,
      fen: puzzle.fen
    });
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
        hardPuzzlesSolved: 0,
        tokens: 0,
        recentPuzzles: []
      });
    }
    
    // Get recent puzzles with details
    const recentPuzzles = await Promise.all(
      userProgress.puzzleHistory.slice(0, 10).map(async (history) => {
        const puzzle = await ChessPuzzle.findById(history.puzzle);
        return {
          id: history.puzzle,
          difficulty: puzzle ? puzzle.difficulty : 'unknown',
          solved: history.solved,
          attempts: history.attempts,
          date: history.date
        };
      })
    );
    
    res.json({
      currentStreak: userProgress.currentStreak,
      bestStreak: userProgress.bestStreak,
      puzzlesAttempted: userProgress.puzzlesAttempted,
      puzzlesSolved: userProgress.puzzlesSolved,
      easyPuzzlesSolved: userProgress.easyPuzzlesSolved,
      intermediatePuzzlesSolved: userProgress.intermediatePuzzlesSolved,
      hardPuzzlesSolved: userProgress.hardPuzzlesSolved,
      tokens: userProgress.tokens,
      recentPuzzles: recentPuzzles
    });
  } catch (err) {
    console.error('Error getting user progress:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};

// Redeem tokens for rewards (if implemented)
exports.redeemTokens = async (req, res) => {
  try {
    const { rewardId } = req.body;
    const userId = req.user.id;
    
    // Find the reward
    const reward = await Reward.findById(rewardId);
    if (!reward) {
      return res.status(404).json({ msg: 'Reward not found' });
    }
    
    // Check if user has enough tokens
    const userProgress = await UserPuzzleProgress.findOne({ user: userId });
    if (!userProgress) {
      return res.status(400).json({ msg: 'User progress not found' });
    }
    
    if (userProgress.tokens < reward.tokenAmount) {
      return res.status(400).json({ msg: 'Not enough tokens' });
    }
    
    // Deduct tokens
    userProgress.tokens -= reward.tokenAmount;
    await userProgress.save();
    
    // Here you would add logic to grant the actual reward to the user
    // This depends on what rewards you want to offer
    
    res.json({
      success: true,
      message: 'Reward redeemed successfully',
      remainingTokens: userProgress.tokens
    });
  } catch (err) {
    console.error('Error redeeming tokens:', err.message);
    res.status(500).json({ msg: 'Server error' });
  }
};
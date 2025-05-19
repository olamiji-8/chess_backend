const PuzzleUser = require('../models/userModel');

exports.createOrGetUser = async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }
    
    // Check if username is taken
    let user = await PuzzleUser.findOne({ username });
    
    if (user) {
      return res.status(200).json({
        message: 'User retrieved successfully',
        user: {
          id: user._id,
          username: user.username,
          points: user.points,
          streak: user.streak,
          canPlayPuzzleToday: user.canPlayPuzzleToday(),
          playedGames: user.playedGames,
          wonGames: user.wonGames
        },
        isNewUser: false
      });
    }
    
    // Create new user
    user = new PuzzleUser({ username });
    await user.save();
    
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        username: user.username,
        points: user.points,
        streak: user.streak,
        canPlayPuzzleToday: true,
        playedGames: user.playedGames,
        wonGames: user.wonGames
      },
      isNewUser: true
    });
    
  } catch (error) {
    console.error('Error in createOrGetUser:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Check if username exists
exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }
    
    const user = await PuzzleUser.findOne({ username });
    
    res.status(200).json({
      exists: !!user,
      username
    });
    
  } catch (error) {
    console.error('Error in checkUsername:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user details
exports.getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await PuzzleUser.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        points: user.points,
        streak: user.streak,
        canPlayPuzzleToday: user.canPlayPuzzleToday(),
        playedGames: user.playedGames,
        wonGames: user.wonGames
      }
    });
    
  } catch (error) {
    console.error('Error in getUserDetails:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get leaderboard
exports.getLeaderboard = async (req, res) => {
  try {
    const topUsers = await PuzzleUser.find()
      .sort({ points: -1 })
      .limit(50) // Top 50 users
      .select('username points streak playedGames wonGames');
      
    res.status(200).json({ leaderboard: topUsers });
    
  } catch (error) {
    console.error('Error in getLeaderboard:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
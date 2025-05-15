// Game controller for multiplayer
const Game = require('../models/gameModel');
const User = require('../models/userModel');
const OnlineUser = require('../models/onlineUserModel');
const mongoose = require('mongoose');

// Create a new game
exports.createGame = async (req, res) => {
  try {
    const { whitePlayerId, blackPlayerId } = req.body;
    
    // Validate presence of players
    if (!whitePlayerId || !blackPlayerId) {
      return res.status(400).json({ message: 'Both player IDs are required' });
    }
    
    // Check if players exist
    const whitePlayer = await User.findById(whitePlayerId);
    const blackPlayer = await User.findById(blackPlayerId);
    
    if (!whitePlayer || !blackPlayer) {
      return res.status(404).json({ message: 'One or both players not found' });
    }
    
    // Check if players are already in a game
    const existingGame = await Game.findOne({
      $or: [
        { status: 'active', whitePlayer: whitePlayerId },
        { status: 'active', blackPlayer: whitePlayerId },
        { status: 'active', whitePlayer: blackPlayerId },
        { status: 'active', blackPlayer: blackPlayerId }
      ]
    });
    
    if (existingGame) {
      return res.status(403).json({ 
        message: 'One or both players are already in an active game',
        gameId: existingGame._id
      });
    }
    
    // Create new game
    const game = new Game({
      whitePlayer: whitePlayerId,
      blackPlayer: blackPlayerId,
      status: 'active',
      // Default FEN is already set in the model
    });
    
    await game.save();
    
    // Update player game counts
    whitePlayer.playedGames += 1;
    blackPlayer.playedGames += 1;
    await whitePlayer.save();
    await blackPlayer.save();
    
    // If players are online, update their status
    await OnlineUser.updateMany(
      { user: { $in: [whitePlayerId, blackPlayerId] } },
      { status: 'in_game' }
    );
    
    res.status(201).json({
      message: 'Game created successfully',
      game: {
        id: game._id,
        whitePlayer: whitePlayer.username,
        blackPlayer: blackPlayer.username,
        status: game.status,
        fen: game.fen,
        createdAt: game.createdAt
      }
    });
    
  } catch (error) {
    console.error('Error in createGame:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get game details
exports.getGameDetails = async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const game = await Game.findById(gameId)
      .populate('whitePlayer', 'username points')
      .populate('blackPlayer', 'username points')
      .populate('winner', 'username');
    
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    res.status(200).json({
      game: {
        id: game._id,
        whitePlayer: {
          id: game.whitePlayer._id,
          username: game.whitePlayer.username,
          points: game.whitePlayer.points
        },
        blackPlayer: {
          id: game.blackPlayer._id,
          username: game.blackPlayer.username,
          points: game.blackPlayer.points
        },
        status: game.status,
        fen: game.fen,
        pgn: game.pgn,
        result: game.result,
        winner: game.winner ? {
          id: game.winner._id,
          username: game.winner.username
        } : null,
        moves: game.moves,
        createdAt: game.createdAt,
        lastMoveAt: game.lastMoveAt
      }
    });
    
  } catch (error) {
    console.error('Error in getGameDetails:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Make a move in the game
exports.makeMove = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { from, to, piece, pgn, fen, userId, isCheck, isCheckmate, isDraw } = req.body;
    
    // Validate move data
    if (!from || !to || !piece || !pgn || !fen || !userId) {
      return res.status(400).json({ message: 'All move details are required' });
    }
    
    // Find the game
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Verify game is active
    if (game.status !== 'active') {
      return res.status(403).json({ message: `Game is not active, current status: ${game.status}` });
    }
    
    // Verify it's the user's turn
    const isWhiteMove = game.moves.length % 2 === 0;
    const playerRole = game.whitePlayer.toString() === userId ? 'white' : 'black';
    
    if ((isWhiteMove && playerRole !== 'white') || (!isWhiteMove && playerRole !== 'black')) {
      return res.status(403).json({ message: 'It\'s not your turn' });
    }
    
    // Record the move
    game.moves.push({ from, to, piece });
    game.fen = fen;
    game.pgn = pgn;
    game.lastMoveAt = new Date();
    
    // Check if the game is over
    if (isCheckmate) {
      game.status = 'completed';
      game.winner = userId;
      game.result = playerRole === 'white' ? '1-0' : '0-1';
      
      // Update winner's stats
      const winner = await User.findById(userId);
      if (winner) {
        winner.points += 1; // 1 point for winning multiplayer
        winner.wonGames += 1;
        await winner.save();
      }
      
    } else if (isDraw) {
      game.status = 'completed';
      game.result = '1/2-1/2';
      
      // Update both players (0.5 points each for draw)
      const whitePlayer = await User.findById(game.whitePlayer);
      const blackPlayer = await User.findById(game.blackPlayer);
      
      if (whitePlayer) {
        whitePlayer.points += 0.5;
        await whitePlayer.save();
      }
      
      if (blackPlayer) {
        blackPlayer.points += 0.5;
        await blackPlayer.save();
      }
    }
    
    await game.save();
    
    // If game ended, update players' online status
    if (game.status === 'completed') {
      await OnlineUser.updateMany(
        { user: { $in: [game.whitePlayer, game.blackPlayer] } },
        { status: 'online' }
      );
    }
    
    res.status(200).json({
      message: 'Move recorded successfully',
      move: { from, to, piece },
      fen: game.fen,
      status: game.status,
      isCheck,
      isCheckmate,
      isDraw,
      result: game.result,
      winner: game.winner
    });
    
  } catch (error) {
    console.error('Error in makeMove:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Resign from game
exports.resignGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    
    // Find the game
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    // Verify game is active
    if (game.status !== 'active') {
      return res.status(403).json({ message: `Game is not active, current status: ${game.status}` });
    }
    
    // Verify user is a player in this game
    if (game.whitePlayer.toString() !== userId && game.blackPlayer.toString() !== userId) {
      return res.status(403).json({ message: 'You are not a player in this game' });
    }
    
    // Mark game as completed
    game.status = 'completed';
    
    // Set the opponent as winner
    if (game.whitePlayer.toString() === userId) {
      game.winner = game.blackPlayer;
      game.result = '0-1'; // Black wins
    } else {
      game.winner = game.whitePlayer;
      game.result = '1-0'; // White wins
    }
    
    await game.save();
    
    // Update winner's stats
    const winner = await User.findById(game.winner);
    if (winner) {
      winner.points += 1; // 1 point for winning multiplayer
      winner.wonGames += 1;
      await winner.save();
    }
    
    // Update players' online status
    await OnlineUser.updateMany(
      { user: { $in: [game.whitePlayer, game.blackPlayer] } },
      { status: 'online' }
    );
    
    res.status(200).json({
      message: 'Game resigned successfully',
      status: game.status,
      result: game.result,
      winner: game.winner
    });
    
  } catch (error) {
    console.error('Error in resignGame:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get active games for user
exports.getUserActiveGames = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const activeGames = await Game.find({
      status: 'active',
      $or: [{ whitePlayer: userId }, { blackPlayer: userId }]
    })
    .populate('whitePlayer', 'username')
    .populate('blackPlayer', 'username')
    .sort({ lastMoveAt: -1 });
    
    res.status(200).json({ 
      games: activeGames.map(game => ({
        id: game._id,
        whitePlayer: {
          id: game.whitePlayer._id,
          username: game.whitePlayer.username
        },
        blackPlayer: {
          id: game.blackPlayer._id,
          username: game.blackPlayer.username
        },
        status: game.status,
        fen: game.fen,
        lastMoveAt: game.lastMoveAt,
        playerRole: game.whitePlayer._id.toString() === userId ? 'white' : 'black',
        isPlayerTurn: 
          (game.moves.length % 2 === 0 && game.whitePlayer._id.toString() === userId) || 
          (game.moves.length % 2 === 1 && game.blackPlayer._id.toString() === userId)
      }))
    });
    
  } catch (error) {
    console.error('Error in getUserActiveGames:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user's game history
exports.getUserGameHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10, page = 1 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const games = await Game.find({
      status: 'completed',
      $or: [{ whitePlayer: userId }, { blackPlayer: userId }]
    })
    .populate('whitePlayer', 'username')
    .populate('blackPlayer', 'username')
    .populate('winner', 'username')
    .sort({ lastMoveAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    const total = await Game.countDocuments({
      status: 'completed',
      $or: [{ whitePlayer: userId }, { blackPlayer: userId }]
    });
    
    res.status(200).json({ 
      games: games.map(game => ({
        id: game._id,
        whitePlayer: {
          id: game.whitePlayer._id,
          username: game.whitePlayer.username
        },
        blackPlayer: {
          id: game.blackPlayer._id,
          username: game.blackPlayer.username
        },
        result: game.result,
        winner: game.winner ? {
          id: game.winner._id,
          username: game.winner.username
        } : null,
        playerRole: game.whitePlayer._id.toString() === userId ? 'white' : 'black',
        didPlayerWin: game.winner && game.winner._id.toString() === userId,
        completedAt: game.lastMoveAt,
        movesCount: game.moves.length
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Error in getUserGameHistory:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Find opponent by username
exports.findOpponent = async (req, res) => {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }
    
    const opponent = await User.findOne({ username }).select('_id username points');
    
    if (!opponent) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if opponent is online
    const opponentOnline = await OnlineUser.findOne({ user: opponent._id });
    
    res.status(200).json({
      opponent: {
        id: opponent._id,
        username: opponent.username,
        points: opponent.points,
        isOnline: !!opponentOnline,
        status: opponentOnline ? opponentOnline.status : 'offline'
      }
    });
    
  } catch (error) {
    console.error('Error in findOpponent:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get online users for matchmaking
exports.getOnlineUsers = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get online users excluding the requesting user
    const onlineUsers = await OnlineUser.find({
      user: { $ne: mongoose.Types.ObjectId(userId) },
      status: 'online'
    })
    .populate('user', 'username points playedGames wonGames')
    .sort({ lastActive: -1 })
    .limit(20);
    
    res.status(200).json({
      onlineUsers: onlineUsers.map(ou => ({
        id: ou.user._id,
        username: ou.user.username,
        points: ou.user.points,
        playedGames: ou.user.playedGames,
        wonGames: ou.user.wonGames,
        lastActive: ou.lastActive
      }))
    });
    
  } catch (error) {
    console.error('Error in getOnlineUsers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
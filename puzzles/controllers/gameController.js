// Game controller for multiplayer chess with Chess.js validation
const Game = require('../models/gameModel');
const User = require('../models/userModel');
const OnlineUser = require('../models/onlineUserModel');
const mongoose = require('mongoose');
const { Chess } = require('chess.js');

// Create a new game
exports.createGame = async (req, res) => {
  try {
    const { whitePlayerId, blackPlayerId } = req.body;
    
    // Validate presence of players
    if (!whitePlayerId || !blackPlayerId) {
      return res.status(400).json({ message: 'Both player IDs are required' });
    }
    
    // Prevent self-play
    if (whitePlayerId === blackPlayerId) {
      return res.status(400).json({ message: 'Players cannot play against themselves' });
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
    
    // Create new game with chess.js validation
    const chess = new Chess();
    const game = new Game({
      whitePlayer: whitePlayerId,
      blackPlayer: blackPlayerId,
      status: 'active',
      fen: chess.fen(),
      pgn: chess.pgn()
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
        whitePlayer: {
          id: whitePlayer._id,
          username: whitePlayer.username
        },
        blackPlayer: {
          id: blackPlayer._id,
          username: blackPlayer.username
        },
        status: game.status,
        fen: game.fen,
        pgn: game.pgn,
        currentTurn: 'white',
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
    
    // Calculate current turn
    const chess = new Chess(game.fen);
    const currentTurn = chess.turn() === 'w' ? 'white' : 'black';
    
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
        currentTurn: currentTurn,
        isCheck: chess.inCheck(),
        isCheckmate: chess.isCheckmate(),
        isStalemate: chess.isStalemate(),
        isDraw: chess.isDraw(),
        createdAt: game.createdAt,
        lastMoveAt: game.lastMoveAt,
        moveCount: game.moves.length
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
    const { from, to, userId, promotion } = req.body;
    
    // Validate move data
    if (!from || !to || !userId) {
      return res.status(400).json({ message: 'from, to, and userId are required' });
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
    
    // Initialize chess with current game state
    const chess = new Chess(game.fen);
    
    // Verify it's the user's turn
    const currentTurn = chess.turn(); // 'w' for white, 'b' for black
    const playerRole = game.whitePlayer.toString() === userId ? 'white' : 'black';
    
    if (!game.whitePlayer.equals(userId) && !game.blackPlayer.equals(userId)) {
      return res.status(403).json({ message: 'You are not a player in this game' });
    }
    
    if ((currentTurn === 'w' && playerRole !== 'white') || 
        (currentTurn === 'b' && playerRole !== 'black')) {
      return res.status(403).json({ message: 'It\'s not your turn' });
    }
    
    // Attempt to make the move
    const moveOptions = { from, to };
    if (promotion) {
      moveOptions.promotion = promotion; // for pawn promotion
    }
    
    const move = chess.move(moveOptions);
    
    if (!move) {
      return res.status(400).json({ 
        message: 'Invalid move',
        details: 'Move is not legal in current position'
      });
    }
    
    // Record the move
    game.moves.push({ 
      from: move.from, 
      to: move.to, 
      piece: move.piece,
      captured: move.captured || null,
      promotion: move.promotion || null,
      flags: move.flags,
      san: move.san
    });
    
    game.fen = chess.fen();
    game.pgn = chess.pgn();
    game.lastMoveAt = new Date();
    
    // Check game state
    const isCheck = chess.inCheck();
    const isCheckmate = chess.isCheckmate();
    const isStalemate = chess.isStalemate();
    const isDraw = chess.isDraw();
    const isGameOver = chess.isGameOver();
    
    // Handle game completion
    if (isGameOver) {
      game.status = 'completed';
      
      if (isCheckmate) {
        // Current player wins (the one who just moved)
        game.winner = userId;
        game.result = playerRole === 'white' ? '1-0' : '0-1';
        
        // Update winner's stats
        const winner = await User.findById(userId);
        if (winner) {
          winner.points += 1;
          winner.wonGames += 1;
          await winner.save();
        }
        
      } else if (isDraw || isStalemate) {
        // Draw
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
      move: {
        from: move.from,
        to: move.to,
        piece: move.piece,
        captured: move.captured,
        promotion: move.promotion,
        san: move.san,
        flags: move.flags
      },
      gameState: {
        fen: game.fen,
        pgn: game.pgn,
        status: game.status,
        currentTurn: chess.turn() === 'w' ? 'white' : 'black',
        isCheck: isCheck,
        isCheckmate: isCheckmate,
        isStalemate: isStalemate,
        isDraw: isDraw,
        isGameOver: isGameOver,
        result: game.result,
        winner: game.winner,
        moveCount: game.moves.length
      }
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
    if (!game.whitePlayer.equals(userId) && !game.blackPlayer.equals(userId)) {
      return res.status(403).json({ message: 'You are not a player in this game' });
    }
    
    // Mark game as completed
    game.status = 'completed';
    
    // Set the opponent as winner
    if (game.whitePlayer.toString() === userId) {
      game.winner = game.blackPlayer;
      game.result = '0-1'; // Black wins by resignation
    } else {
      game.winner = game.whitePlayer;
      game.result = '1-0'; // White wins by resignation
    }
    
    // Update PGN to include resignation
    const chess = new Chess(game.fen);
    game.pgn = chess.pgn() + (game.result === '1-0' ? ' 1-0' : ' 0-1');
    
    await game.save();
    
    // Update winner's stats
    const winner = await User.findById(game.winner);
    if (winner) {
      winner.points += 1;
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
      winner: game.winner,
      pgn: game.pgn
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
    
    const gamesWithDetails = activeGames.map(game => {
      const chess = new Chess(game.fen);
      const currentTurn = chess.turn();
      const playerRole = game.whitePlayer._id.toString() === userId ? 'white' : 'black';
      const isPlayerTurn = (currentTurn === 'w' && playerRole === 'white') || 
                          (currentTurn === 'b' && playerRole === 'black');
      
      return {
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
        currentTurn: currentTurn === 'w' ? 'white' : 'black',
        lastMoveAt: game.lastMoveAt,
        playerRole: playerRole,
        isPlayerTurn: isPlayerTurn,
        moveCount: game.moves.length,
        isCheck: chess.inCheck()
      };
    });
    
    res.status(200).json({ 
      games: gamesWithDetails,
      count: gamesWithDetails.length
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
    
    const gamesWithDetails = games.map(game => {
      const playerRole = game.whitePlayer._id.toString() === userId ? 'white' : 'black';
      const didPlayerWin = game.winner && game.winner._id.toString() === userId;
      
      let gameResult = 'loss';
      if (game.result === '1/2-1/2') {
        gameResult = 'draw';
      } else if (didPlayerWin) {
        gameResult = 'win';
      }
      
      return {
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
        playerRole: playerRole,
        gameResult: gameResult,
        didPlayerWin: didPlayerWin,
        completedAt: game.lastMoveAt,
        movesCount: game.moves.length,
        pgn: game.pgn
      };
    });
    
    res.status(200).json({ 
      games: gamesWithDetails,
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
    
    const opponent = await User.findOne({ 
      username: { $regex: new RegExp(username, 'i') } // Case insensitive search
    }).select('_id username points playedGames wonGames');
    
    if (!opponent) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if opponent is online
    const opponentOnline = await OnlineUser.findOne({ user: opponent._id });
    
    // Check if opponent is in active game
    const opponentInGame = await Game.findOne({
      status: 'active',
      $or: [{ whitePlayer: opponent._id }, { blackPlayer: opponent._id }]
    });
    
    res.status(200).json({
      opponent: {
        id: opponent._id,
        username: opponent.username,
        points: opponent.points,
        playedGames: opponent.playedGames,
        wonGames: opponent.wonGames,
        winRate: opponent.playedGames > 0 ? 
          ((opponent.wonGames / opponent.playedGames) * 100).toFixed(1) + '%' : '0%',
        isOnline: !!opponentOnline,
        status: opponentOnline ? opponentOnline.status : 'offline',
        isInGame: !!opponentInGame
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
      status: { $in: ['online', 'away'] } // Exclude users in games
    })
    .populate('user', 'username points playedGames wonGames')
    .sort({ lastActive: -1 })
    .limit(20);
    
    const usersWithStats = onlineUsers.map(ou => ({
      id: ou.user._id,
      username: ou.user.username,
      points: ou.user.points,
      playedGames: ou.user.playedGames,
      wonGames: ou.user.wonGames,
      winRate: ou.user.playedGames > 0 ? 
        ((ou.user.wonGames / ou.user.playedGames) * 100).toFixed(1) + '%' : '0%',
      status: ou.status,
      lastActive: ou.lastActive
    }));
    
    res.status(200).json({
      onlineUsers: usersWithStats,
      count: usersWithStats.length
    });
    
  } catch (error) {
    console.error('Error in getOnlineUsers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get possible moves for a piece (helper endpoint for frontend)
exports.getPossibleMoves = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { square } = req.query;
    
    if (!square) {
      return res.status(400).json({ message: 'Square parameter is required' });
    }
    
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ message: 'Game not found' });
    }
    
    const chess = new Chess(game.fen);
    const moves = chess.moves({ square: square, verbose: true });
    
    res.status(200).json({
      square: square,
      possibleMoves: moves.map(move => ({
        to: move.to,
        piece: move.piece,
        captured: move.captured,
        promotion: move.promotion,
        flags: move.flags
      }))
    });
    
  } catch (error) {
    console.error('Error in getPossibleMoves:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
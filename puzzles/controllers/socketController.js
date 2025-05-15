// Socket controller for real-time communication
const OnlineUser = require('../models/onlineUserModel');
const Game = require('../models/gameModel');
const User = require('../models/userModel');

module.exports = (io) => {
  // Store socket to user mapping for easy reference
  const socketToUser = new Map();

  io.on('connection', async (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // User connects and identifies themselves
    socket.on('user:connect', async ({ userId }) => {
      try {
        if (!userId) return;

        // Store socket-user mapping
        socketToUser.set(socket.id, userId);

        // Create or update online status
        await OnlineUser.findOneAndUpdate(
          { user: userId },
          { 
            socketId: socket.id, 
            status: 'online',
            lastActive: new Date()
          },
          { upsert: true, new: true }
        );

        // Broadcast updated online users list
        broadcastOnlineUsers();
      } catch (error) {
        console.error('Error handling user connect:', error);
      }
    });

    // User disconnects
    socket.on('disconnect', async () => {
      try {
        const userId = socketToUser.get(socket.id);
        if (userId) {
          // Remove from online users
          await OnlineUser.deleteOne({ socketId: socket.id });
          socketToUser.delete(socket.id);
          
          // Check if user was in game and handle accordingly
          const activeGame = await Game.findOne({
            status: 'active',
            $or: [{ whitePlayer: userId }, { blackPlayer: userId }]
          });

          if (activeGame) {
            // Keep game active for a reconnection window
            // Could implement a timeout here
          }

          // Broadcast updated online users list
          broadcastOnlineUsers();
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });

    // User sends game invitation
    socket.on('game:invite', async (data) => {
      try {
        const { inviterId, inviteeId } = data;
        
        // Find invitee online status
        const invitee = await OnlineUser.findOne({ user: inviteeId }).populate('user', 'username');
        
        if (invitee && invitee.socketId) {
          // Get inviter info
          const inviter = await User.findById(inviterId).select('username');
          
          // Send invitation to invitee
          io.to(invitee.socketId).emit('game:invitation', {
            inviterId,
            inviterName: inviter.username
          });
        }
      } catch (error) {
        console.error('Error handling game invitation:', error);
      }
    });

    // User accepts game invitation
    socket.on('game:accept', async (data) => {
      try {
        const { inviterId, inviteeId } = data;
        
        // Find inviter socket
        const inviter = await OnlineUser.findOne({ user: inviterId });
        
        if (inviter) {
          // Notify inviter that invitation was accepted
          io.to(inviter.socketId).emit('game:accepted', { inviteeId });
          
          // Create a new game automatically
          const game = new Game({
            whitePlayer: inviterId,
            blackPlayer: inviteeId,
            status: 'active'
          });
          
          await game.save();
          
          // Update users' status
          await OnlineUser.updateMany(
            { user: { $in: [inviterId, inviteeId] } },
            { status: 'in_game' }
          );
          
          // Send game details to both players
          const gameDetails = {
            gameId: game._id,
            whitePlayer: inviterId,
            blackPlayer: inviteeId,
            fen: game.fen
          };
          
          io.to(inviter.socketId).emit('game:start', gameDetails);
          socket.emit('game:start', gameDetails);
          
          // Broadcast updated online users list
          broadcastOnlineUsers();
        }
      } catch (error) {
        console.error('Error handling game acceptance:', error);
      }
    });

    // User declines game invitation
    socket.on('game:decline', async (data) => {
      try {
        const { inviterId } = data;
        
        // Find inviter socket
        const inviter = await OnlineUser.findOne({ user: inviterId });
        
        if (inviter) {
          // Notify inviter that invitation was declined
          io.to(inviter.socketId).emit('game:declined');
        }
      } catch (error) {
        console.error('Error handling game decline:', error);
      }
    });

    // User makes a move in multiplayer game
    socket.on('game:move', async (data) => {
      try {
        const { gameId, from, to, piece, fen, pgn, isCheck, isCheckmate, isDraw } = data;
        const userId = socketToUser.get(socket.id);
        
        // Find the game
        const game = await Game.findById(gameId);
        
        if (!game || game.status !== 'active') return;
        
        // Verify it's the user's turn
        const isWhiteMove = game.moves.length % 2 === 0;
        const playerRole = game.whitePlayer.toString() === userId ? 'white' : 'black';
        
        if ((isWhiteMove && playerRole !== 'white') || (!isWhiteMove && playerRole !== 'black')) {
          return;
        }
        
        // Find opponent socket
        const opponentId = playerRole === 'white' ? game.blackPlayer : game.whitePlayer;
        const opponent = await OnlineUser.findOne({ user: opponentId });
        
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
        
        // If opponent is connected, send them the move
        if (opponent) {
          io.to(opponent.socketId).emit('game:opponent_move', {
            gameId,
            from,
            to,
            piece,
            fen,
            isCheck,
            isCheckmate,
            isDraw,
            status: game.status,
            result: game.result,
            winner: game.winner
          });
        }
        
        // If game ended, update players' online status
        if (game.status === 'completed') {
          await OnlineUser.updateMany(
            { user: { $in: [game.whitePlayer, game.blackPlayer] } },
            { status: 'online' }
          );
          
          // Broadcast updated online users list
          broadcastOnlineUsers();
        }
      } catch (error) {
        console.error('Error handling game move:', error);
      }
    });

    // User sends heartbeat to update last active time
    socket.on('user:heartbeat', async () => {
      try {
        const userId = socketToUser.get(socket.id);
        if (userId) {
          await OnlineUser.findOneAndUpdate(
            { user: userId },
            { lastActive: new Date() }
          );
        }
      } catch (error) {
        console.error('Error handling heartbeat:', error);
      }
    });
  });

  // Helper function to broadcast online users
  async function broadcastOnlineUsers() {
    try {
      const onlineUsers = await OnlineUser.find()
        .populate('user', 'username points playedGames wonGames')
        .sort({ lastActive: -1 });

      const formattedUsers = onlineUsers.map(ou => ({
        id: ou.user._id,
        username: ou.user.username,
        points: ou.user.points,
        status: ou.status,
        playedGames: ou.user.playedGames,
        wonGames: ou.user.wonGames
      }));

      io.emit('users:online', { users: formattedUsers });
    } catch (error) {
      console.error('Error broadcasting online users:', error);
    }
  }
};
// Socket controller for real-time chess communication with Chess.js validation
const OnlineUser = require('../models/onlineUserModel');
const Game = require('../models/gameModel');
const User = require('../models/userModel');
const { Chess } = require('chess.js');

module.exports = (io) => {
  // Store socket to user mapping for easy reference
  const socketToUser = new Map();
  const userToSocket = new Map();

  // Helper function to find socket by user ID
  const findSocketByUserId = (userId) => {
    const socketId = userToSocket.get(userId.toString());
    return socketId ? io.sockets.sockets.get(socketId) : null;
  };

  // Helper function to broadcast online users
  const broadcastOnlineUsers = async () => {
    try {
      const onlineUsers = await OnlineUser.find({ status: { $in: ['online', 'away'] } })
        .populate('user', 'username points playedGames wonGames')
        .sort({ lastActive: -1 });

      const userList = onlineUsers.map(ou => ({
        id: ou.user._id,
        username: ou.user.username,
        points: ou.user.points,
        status: ou.status,
        lastActive: ou.lastActive
      }));

      io.emit('users:online_list', { 
        users: userList,
        count: userList.length 
      });
    } catch (error) {
      console.error('Error broadcasting online users:', error);
    }
  };

  io.on('connection', async (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // User connects and identifies themselves
    socket.on('user:connect', async ({ userId }) => {
      try {
        if (!userId) return;

        // Store socket-user mapping
        socketToUser.set(socket.id, userId);
        userToSocket.set(userId.toString(), socket.id);

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

        // Join user to their personal room for notifications
        socket.join(`user_${userId}`);

        // Check if user has any active games and join those rooms
        const activeGames = await Game.find({
          status: 'active',
          $or: [{ whitePlayer: userId }, { blackPlayer: userId }]
        }).populate('whitePlayer blackPlayer', 'username');

        activeGames.forEach(game => {
          socket.join(`game_${game._id}`);
        });

        console.log(`User ${userId} connected with socket ${socket.id}`);

        // Broadcast updated online users list
        await broadcastOnlineUsers();

        // Send user their active games
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
            playerRole,
            isPlayerTurn,
            currentTurn: currentTurn === 'w' ? 'white' : 'black',
            fen: game.fen,
            lastMoveAt: game.lastMoveAt,
            moveCount: game.moves.length
          };
        });

        socket.emit('user:active_games', {
          games: gamesWithDetails
        });

      } catch (error) {
        console.error('Error handling user connect:', error);
        socket.emit('error', { message: 'Connection failed' });
      }
    });

    // User disconnects
    socket.on('disconnect', async () => {
      try {
        const userId = socketToUser.get(socket.id);
        if (userId) {
          console.log(`User ${userId} disconnected`);
          
          // Remove from online users
          await OnlineUser.deleteOne({ socketId: socket.id });
          socketToUser.delete(socket.id);
          userToSocket.delete(userId.toString());
          
          // Check if user was in game and handle accordingly
          const activeGame = await Game.findOne({
            status: 'active',
            $or: [{ whitePlayer: userId }, { blackPlayer: userId }]
          });

          if (activeGame) {
            // Notify opponent about disconnection
            const opponentId = activeGame.whitePlayer.toString() === userId ? 
              activeGame.blackPlayer : activeGame.whitePlayer;
            
            io.to(`user_${opponentId}`).emit('opponent:disconnected', {
              gameId: activeGame._id,
              message: 'Your opponent has disconnected'
            });
          }

          // Broadcast updated online users list
          await broadcastOnlineUsers();
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });

    // User sends game invitation
    socket.on('game:invite', async (data) => {
      try {
        const { inviterId, inviteeId } = data;
        
        if (!inviterId || !inviteeId) {
          socket.emit('error', { message: 'Invalid invitation data' });
          return;
        }

        // Prevent self-invitation
        if (inviterId === inviteeId) {
          socket.emit('game:invite_failed', { 
            message: 'You cannot invite yourself' 
          });
          return;
        }

        // Find invitee online status
        const invitee = await OnlineUser.findOne({ user: inviteeId })
          .populate('user', 'username points');
        
        if (!invitee || invitee.status !== 'online') {
          socket.emit('game:invite_failed', { 
            message: 'User is not online or available' 
          });
          return;
        }
        
        // Get inviter info
        const inviter = await User.findById(inviterId).select('username points');
        
        if (!inviter) {
          socket.emit('error', { message: 'Inviter not found' });
          return;
        }
        
        // Send invitation to invitee
        io.to(`user_${inviteeId}`).emit('game:invitation', {
          inviterId,
          inviterName: inviter.username,
          inviterPoints: inviter.points,
          timestamp: new Date()
        });

        // Confirm invitation sent
        socket.emit('game:invite_sent', {
          inviteeName: invitee.user.username,
          message: 'Invitation sent successfully'
        });
        
      } catch (error) {
        console.error('Error handling game invitation:', error);
        socket.emit('error', { message: 'Failed to send invitation' });
      }
    });

    // User accepts game invitation
    socket.on('game:accept', async (data) => {
      try {
        const { inviterId, inviteeId } = data;
        
        if (!inviterId || !inviteeId) {
          socket.emit('error', { message: 'Invalid acceptance data' });
          return;
        }

        // Check if both users are still online and available
        const inviter = await OnlineUser.findOne({ user: inviterId });
        const invitee = await OnlineUser.findOne({ user: inviteeId });
        
        if (!inviter || !invitee) {
          socket.emit('game:start_failed', { 
            message: 'One or both players are no longer online' 
          });
          return;
        }

        // Check if either player is already in a game
        const existingGame = await Game.findOne({
          status: 'active',
          $or: [
            { whitePlayer: inviterId },
            { blackPlayer: inviterId },
            { whitePlayer: inviteeId },
            { blackPlayer: inviteeId }
          ]
        });

        if (existingGame) {
          socket.emit('game:start_failed', { 
            message: 'One or both players are already in a game' 
          });
          return;
        }
        
        // Create chess instance for initial position
        const chess = new Chess();
        
        // Create a new game (inviter plays white)
        const game = new Game({
          whitePlayer: inviterId,
          blackPlayer: inviteeId,
          status: 'active',
          fen: chess.fen(),
          pgn: chess.pgn()
        });
        
        await game.save();

        // Update player statistics
        const whitePlayer = await User.findById(inviterId);
        const blackPlayer = await User.findById(inviteeId);
        
        if (whitePlayer) {
          whitePlayer.playedGames += 1;
          await whitePlayer.save();
        }
        
        if (blackPlayer) {
          blackPlayer.playedGames += 1;
          await blackPlayer.save();
        }
        
        // Update users' status to in_game
        await OnlineUser.updateMany(
          { user: { $in: [inviterId, inviteeId] } },
          { status: 'in_game' }
        );
        
        // Join both players to the game room
        const inviterSocket = findSocketByUserId(inviterId);
        const inviteeSocket = socket;
        
        if (inviterSocket) {
          inviterSocket.join(`game_${game._id}`);
        }
        inviteeSocket.join(`game_${game._id}`);
        
        // Send game details to both players
        const gameDetails = {
          gameId: game._id,
          whitePlayer: {
            id: inviterId,
            username: whitePlayer?.username
          },
          blackPlayer: {
            id: inviteeId,
            username: blackPlayer?.username
          },
          fen: game.fen,
          pgn: game.pgn,
          currentTurn: 'white',
          status: 'active',
          createdAt: game.createdAt
        };
        
        // Notify both players
        io.to(`user_${inviterId}`).emit('game:start', {
          ...gameDetails,
          yourColor: 'white',
          yourTurn: true
        });
        
        socket.emit('game:start', {
          ...gameDetails,
          yourColor: 'black',
          yourTurn: false
        });

        // Broadcast updated online users (they're now in_game)
        await broadcastOnlineUsers();
        
      } catch (error) {
        console.error('Error handling game acceptance:', error);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // User declines game invitation
    socket.on('game:decline', async (data) => {
      try {
        const { inviterId, inviteeId } = data;
        
        // Get invitee info for notification
        const invitee = await User.findById(inviteeId).select('username');
        
        // Notify inviter about declined invitation
        io.to(`user_${inviterId}`).emit('game:invitation_declined', {
          inviteeName: invitee?.username,
          message: 'Your game invitation was declined'
        });
        
      } catch (error) {
        console.error('Error handling game decline:', error);
      }
    });

    // Real-time move broadcasting
    socket.on('game:move', async (data) => {
      try {
        const { gameId, move, gameState } = data;
        
        if (!gameId || !move || !gameState) {
          socket.emit('error', { message: 'Invalid move data' });
          return;
        }

        // Broadcast move to other players in the game room (excluding sender)
        socket.to(`game_${gameId}`).emit('game:move_made', {
          move,
          gameState,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error('Error broadcasting move:', error);
      }
    });

    // Game completion notification
    socket.on('game:completed', async (data) => {
      try {
        const { gameId, result, winner } = data;
        
        // Broadcast game completion to all players in the room
        io.to(`game_${gameId}`).emit('game:finished', {
          gameId,
          result,
          winner,
          timestamp: new Date()
        });

        // Update online status of players back to 'online'
        const game = await Game.findById(gameId);
        if (game) {
          await OnlineUser.updateMany(
            { user: { $in: [game.whitePlayer, game.blackPlayer] } },
            { status: 'online' }
          );
          
          // Broadcast updated online users
          await broadcastOnlineUsers();
        }
        
      } catch (error) {
        console.error('Error handling game completion:', error);
      }
    });

    // User joins a specific game room (for spectating or rejoining)
    socket.on('game:join', async (data) => {
      try {
        const { gameId, userId } = data;
        
        const game = await Game.findById(gameId);
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Check if user is a player in this game
        const isPlayer = game.whitePlayer.toString() === userId || 
                         game.blackPlayer.toString() === userId;
        
        if (isPlayer) {
          socket.join(`game_${gameId}`);
          socket.emit('game:joined', { 
            gameId,
            message: 'Successfully joined game room'
          });
        } else {
          socket.emit('error', { message: 'You are not a player in this game' });
        }
        
      } catch (error) {
        console.error('Error joining game room:', error);
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // User leaves a game room
    socket.on('game:leave', (data) => {
      try {
        const { gameId } = data;
        socket.leave(`game_${gameId}`);
        socket.emit('game:left', { gameId });
      } catch (error) {
        console.error('Error leaving game room:', error);
      }
    });

    // Handle chat messages in game
    socket.on('game:chat', (data) => {
      try {
        const { gameId, message, senderId, senderName } = data;
        
        if (!gameId || !message || !senderId) {
          socket.emit('error', { message: 'Invalid chat data' });
          return;
        }

        // Broadcast chat message to game room
        io.to(`game_${gameId}`).emit('game:chat_message', {
          senderId,
          senderName,
          message,
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error('Error handling game chat:', error);
      }
    });

    // Handle draw offers
    socket.on('game:offer_draw', async (data) => {
      try {
        const { gameId, offererId } = data;
        
        const game = await Game.findById(gameId)
          .populate('whitePlayer blackPlayer', 'username');
        
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Find opponent
        const opponentId = game.whitePlayer._id.toString() === offererId ? 
          game.blackPlayer._id : game.whitePlayer._id;
        const offerer = game.whitePlayer._id.toString() === offererId ? 
          game.whitePlayer : game.blackPlayer;

        // Send draw offer to opponent
        io.to(`user_${opponentId}`).emit('game:draw_offered', {
          gameId,
          offererId,
          offererName: offerer.username
        });
        
      } catch (error) {
        console.error('Error handling draw offer:', error);
      }
    });

    // Handle draw acceptance
    socket.on('game:accept_draw', (data) => {
      try {
        const { gameId } = data;
        
        // Broadcast draw acceptance to game room
        io.to(`game_${gameId}`).emit('game:draw_accepted', {
          gameId,
          result: '1/2-1/2'
        });
        
      } catch (error) {
        console.error('Error handling draw acceptance:', error);
      }
    });

    // Handle resignation notification
    socket.on('game:resigned', (data) => {
      try {
        const { gameId, resignerId, result } = data;
        
        // Broadcast resignation to game room
        socket.to(`game_${gameId}`).emit('game:opponent_resigned', {
          gameId,
          resignerId,
          result
        });
        
      } catch (error) {
        console.error('Error handling resignation:', error);
      }
    });

    // Update user status (online, away, etc.)
    socket.on('user:status', async (data) => {
      try {
        const { userId, status } = data;
        
        if (!['online', 'away'].includes(status)) {
          socket.emit('error', { message: 'Invalid status' });
          return;
        }

        await OnlineUser.findOneAndUpdate(
          { user: userId },
          { 
            status,
            lastActive: new Date()
          }
        );

        await broadcastOnlineUsers();
        
      } catch (error) {
        console.error('Error updating user status:', error);
      }
    });

    // Heartbeat to keep connection alive
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // Cleanup disconnected users periodically
  setInterval(async () => {
    try {
      const disconnectedUsers = await OnlineUser.find({
        lastActive: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes ago
      });

      if (disconnectedUsers.length > 0) {
        await OnlineUser.deleteMany({
          _id: { $in: disconnectedUsers.map(u => u._id) }
        });
        
        console.log(`Cleaned up ${disconnectedUsers.length} disconnected users`);
        await broadcastOnlineUsers();
      }
    } catch (error) {
      console.error('Error in cleanup:', error);
    }
  }, 60000); // Run every minute
};
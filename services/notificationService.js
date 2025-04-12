const Notification = require('../models/Notification');
const User = require('../models/User');

// Tournament notifications
const tournamentNotificationService = {
  // Notify the organizer when a tournament is created
  async notifyTournamentCreated(tournamentId, organizerId, tournamentTitle) {
    await Notification.create({
      user: organizerId,
      title: 'Tournament Created',
      message: `Your tournament "${tournamentTitle}" has been created successfully.`,
      type: 'tournament_created',
      relatedId: tournamentId,
      relatedModel: 'Tournament'
    });
  },

  // Notify the user when they register for a tournament
  async notifyTournamentRegistration(tournamentId, userId, tournamentTitle) {
    await Notification.create({
      user: userId,
      title: 'Tournament Registration',
      message: `You have successfully registered for "${tournamentTitle}".`,
      type: 'tournament_registration',
      relatedId: tournamentId,
      relatedModel: 'Tournament'
    });
  },

  // Notify the organizer when a user registers for their tournament
  async notifyOrganizerOfRegistration(tournamentId, organizerId, participantName, tournamentTitle) {
    await Notification.create({
      user: organizerId,
      title: 'New Tournament Participant',
      message: `${participantName} has registered for your tournament "${tournamentTitle}".`,
      type: 'tournament_registration',
      relatedId: tournamentId,
      relatedModel: 'Tournament'
    });
  },

  // Send a reminder to participants about an upcoming tournament (24h before)
  async sendTournamentReminder(tournament) {
    const participants = tournament.participants;
    
    for (const userId of participants) {
      await Notification.create({
        user: userId,
        title: 'Tournament Reminder',
        message: `Reminder: The tournament "${tournament.title}" will start in 24 hours.`,
        type: 'tournament_reminder',
        relatedId: tournament._id,
        relatedModel: 'Tournament'
      });
    }
  },
  
  // Notify all participants when a tournament status changes
  async notifyTournamentStatusChange(tournament, newStatus) {
    const statusMessages = {
      'active': 'has started',
      'completed': 'has ended',
      'cancelled': 'has been cancelled'
    };
    
    const message = `Tournament "${tournament.title}" ${statusMessages[newStatus]}.`;
    
    // Notify organizer
    await Notification.create({
      user: tournament.organizer,
      title: 'Tournament Status Update',
      message,
      type: 'tournament_result',
      relatedId: tournament._id,
      relatedModel: 'Tournament'
    });
    
    // Notify all participants
    for (const userId of tournament.participants) {
      await Notification.create({
        user: userId,
        title: 'Tournament Status Update',
        message,
        type: 'tournament_result',
        relatedId: tournament._id,
        relatedModel: 'Tournament'
      });
    }
  }
};

// Transaction notifications
const transactionNotificationService = {
  // Notify user of successful transaction
  async notifyTransactionSuccess(transaction, userId) {
    let message = '';
    let title = 'Transaction Successful';
    
    switch (transaction.type) {
      case 'deposit':
        message = `Your wallet has been credited with ${transaction.amount} successfully.`;
        title = 'Wallet Deposit Successful';
        break;
      case 'withdrawal':
        message = `Your withdrawal of ${transaction.amount} has been processed successfully.`;
        title = 'Withdrawal Successful';
        break;
      case 'tournament_entry':
        message = `Entry fee of ${transaction.amount} for tournament has been processed.`;
        title = 'Tournament Entry Fee Paid';
        break;
      case 'tournament_funding':
        message = `Tournament funding of ${transaction.amount} has been processed.`;
        title = 'Tournament Funding Successful';
        break;
      case 'prize_payout':
        message = `Congratulations! A prize of ${transaction.amount} has been credited to your wallet.`;
        title = 'Prize Payout Received';
        break;
      case 'refund':
        message = `A refund of ${transaction.amount} has been processed to your wallet.`;
        title = 'Refund Processed';
        break;
      default:
        message = `Your transaction of ${transaction.amount} has been completed successfully.`;
    }
    
    await Notification.create({
      user: userId,
      title,
      message,
      type: 'transaction_success',
      relatedId: transaction._id,
      relatedModel: 'Transaction'
    });
  },
  
  // Notify user of failed transaction
  async notifyTransactionFailed(transaction, userId, reason = '') {
    const reasonText = reason ? ` Reason: ${reason}` : '';
    
    let message = '';
    let title = 'Transaction Failed';
    
    switch (transaction.type) {
      case 'deposit':
        message = `Your wallet deposit of ${transaction.amount} has failed.${reasonText}`;
        title = 'Wallet Deposit Failed';
        break;
      case 'withdrawal':
        message = `Your withdrawal request of ${transaction.amount} could not be processed.${reasonText}`;
        title = 'Withdrawal Failed';
        break;
      default:
        message = `Your transaction of ${transaction.amount} has failed.${reasonText}`;
    }
    
    await Notification.create({
      user: userId,
      title,
      message,
      type: 'transaction_failed',
      relatedId: transaction._id,
      relatedModel: 'Transaction'
    });
  }
};

// User account notifications
const userNotificationService = {
  // Notify user of account verification status
  async notifyVerificationStatus(userId, status, reason = '') {
    let message = '';
    let title = '';
    
    switch (status) {
      case 'approved':
        title = 'Account Verification Approved';
        message = 'Your account verification has been approved. You now have full access to all features.';
        break;
      case 'rejected':
        title = 'Account Verification Rejected';
        message = `Your account verification request has been rejected. ${reason ? `Reason: ${reason}` : 'Please check your submitted documents and try again.'}`;
        break;
      case 'pending':
        title = 'Verification In Progress';
        message = 'Your account verification request has been received and is being processed.';
        break;
    }
    
    await Notification.create({
      user: userId,
      title,
      message,
      type: 'account_verification',
      relatedModel: 'User',
      relatedId: userId
    });
  },
  
  // Notify user of wallet balance update
  async notifyWalletUpdate(userId, newBalance, changeAmount, reason) {
    const changeText = changeAmount > 0 ? `increased by ${changeAmount}` : `decreased by ${Math.abs(changeAmount)}`;
    
    await Notification.create({
      user: userId,
      title: 'Wallet Balance Updated',
      message: `Your wallet balance has been ${changeText}. New balance: ${newBalance}. ${reason ? `Reason: ${reason}` : ''}`,
      type: 'wallet_update',
      relatedModel: 'User',
      relatedId: userId
    });
  },
  
  // Send system announcements to all users or specific users
  async sendSystemAnnouncement(message, title = 'System Announcement', specificUserIds = null) {
    if (specificUserIds) {
      // Send to specific users
      for (const userId of specificUserIds) {
        await Notification.create({
          user: userId,
          title,
          message,
          type: 'system_message'
        });
      }
    } else {
      // Send to all users
      const users = await User.find({}, '_id');
      for (const user of users) {
        await Notification.create({
          user: user._id,
          title,
          message,
          type: 'system_message'
        });
      }
    }
  }
};

module.exports = {
  tournamentNotificationService,
  transactionNotificationService,
  userNotificationService
};
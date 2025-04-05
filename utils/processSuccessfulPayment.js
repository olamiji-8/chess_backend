const User = require('../models/User');
const Transaction = require('../models/Transaction');

const processSuccessfulPayment = async (transaction, amount, status) => {
  if (!transaction || transaction.status === 'completed') return;

  const amountInNaira = amount / 100;

  try {
    if (status === 'success') {
      transaction.status = 'completed';
      await transaction.save();

      if (transaction.type === 'transfer' && transaction.recipient) {
        // Handle transfer to another user
        const recipientUser = await User.findById(transaction.recipient);
        if (recipientUser) {
          recipientUser.walletBalance += amountInNaira;
          await recipientUser.save();
          console.log(`Transfer successful: ₦${amountInNaira} added to ${recipientUser.name}`);
        } else {
          console.error(`Recipient with ID ${transaction.recipient} not found`);
        }
      } else {
        // Handle deposit to initiator's wallet
        const user = await User.findById(transaction.user);
        if (user) {
          user.walletBalance += amountInNaira;
          await user.save();
          console.log(`Deposit successful: ₦${amountInNaira} added to ${user.name}`);
        } else {
          console.error(`User with ID ${transaction.user} not found`);
        }
      }
    } else {
      transaction.status = 'failed';
      await transaction.save();
      console.log(`Transaction ${transaction.reference} failed`);
    }
  } catch (error) {
    console.error(`Error processing payment:`, error.message);
  }
};

module.exports = { processSuccessfulPayment };

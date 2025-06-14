const cron = require('node-cron');
const Tournament = require('../models/Tournament');

// Run every 5 minutes to update tournament statuses
const startTournamentStatusCron = () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running tournament status update cron job...');
    
    try {
      const tournaments = await Tournament.find({
        status: { $in: ['upcoming', 'active'] },
        manualStatusOverride: { $ne: true }
      });

      let updatedCount = 0;
      
      for (const tournament of tournaments) {
        if (tournament.updateStatusBasedOnTime()) {
          await tournament.save();
          updatedCount++;
          
          // Optional: Send notifications for status changes
          if (tournament.status === 'active') {
            console.log(`Tournament ${tournament.title} is now active`);
            // Send start notifications here
          } else if (tournament.status === 'completed') {
            console.log(`Tournament ${tournament.title} is now completed`);
            // Send completion notifications here
          }
        }
      }

      if (updatedCount > 0) {
        console.log(`Cron job updated status for ${updatedCount} tournaments`);
      }
    } catch (error) {
      console.error('Error in tournament status cron job:', error);
    }
  });
};

module.exports = { startTournamentStatusCron };

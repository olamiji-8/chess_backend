const Tournament = require('../models/Tournament');

const updateTournamentStatuses = async (req, res, next) => {
  try {
    // Update all tournaments that might need status changes
    const tournaments = await Tournament.find({
      status: { $in: ['upcoming', 'active'] },
      manualStatusOverride: { $ne: true }
    });

    let updatedCount = 0;
    
    for (const tournament of tournaments) {
      if (tournament.updateStatusBasedOnTime()) {
        await tournament.save();
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`Updated status for ${updatedCount} tournaments`);
    }

    next();
  } catch (error) {
    console.error('Error updating tournament statuses:', error);
    next(); // Continue even if status update fails
  }
};

module.exports = { updateTournamentStatuses };

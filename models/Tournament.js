const mongoose = require('mongoose');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isBetween = require('dayjs/plugin/isBetween'); // Add this import

// Extend dayjs with timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween); // Add this extension

const TournamentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Tournament title is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['bullet', 'blitz', 'rapid', 'classical'],
    required: [true, 'Tournament category is required']
  },
  banner: {
    type: String,
    required: [true, 'Tournament banner is required']
  },
  rules: {
    type: String,
    required: [true, 'Tournament rules are required']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    validate: {
      validator: function(v) {
        return /^\d{1,2}:\d{2}$/.test(v);
      },
      message: 'Start time must be in HH:MM format'
    }
  },
  timezone: {
    type: String,
    default: 'UTC',
    required: [true, 'Timezone is required']
  },
  duration: {
    type: Number, // In milliseconds
    required: [true, 'Tournament duration is required']
  },
  prizeType: {
    type: String,
    enum: ['fixed', 'percentage', 'special'],
    required: [true, 'Prize type is required']
  },
  prizes: {
    fixed: {
      '1st': { type: Number, default: 0 },
      '2nd': { type: Number, default: 0 },
      '3rd': { type: Number, default: 0 },
      '4th': { type: Number, default: 0 },
      '5th': { type: Number, default: 0 },
      additional: [{ position: Number, amount: Number }]
    },
    percentage: {
      basePrizePool: { type: Number },
      '1st': { type: Number, default: 0 },
      '2nd': { type: Number, default: 0 },
      '3rd': { type: Number, default: 0 },
      '4th': { type: Number, default: 0 },
      '5th': { type: Number, default: 0 },
      additional: [{ position: Number, percentage: Number }]
    },
    special: {
      isFixed: { type: Boolean, default: true },
      basePrizePool: { type: Number },
      specialPrizes: [{
        category: String,
        amount: Number,
        isPercentage: { type: Boolean, default: false }
      }]
    }
  },
  entryFee: {
    type: Number,
    default: 0
  },
  fundingMethod: {
    type: String,
    enum: ['wallet', 'direct', 'topup'],
    required: [true, 'Funding method is required']
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  // Add these new fields for better status management
  manualStatusOverride: {
    type: Boolean,
    default: false // When true, prevents automatic status updates
  },
  actualStartTime: {
    type: Date,
    default: null // Track when tournament actually started (in UTC)
  },
  actualEndTime: {
    type: Date,
    default: null // Track when tournament actually ended (in UTC)
  },
  tournamentLink: {
    type: String,
    required: true
  },
  password: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Add field to track reminder notifications
  fiveMinuteReminderSent: {
    type: Boolean,
    default: false
  }
});

// Virtual field to calculate real-time status
TournamentSchema.virtual('currentStatus').get(function() {
  if (this.manualStatusOverride || this.status === 'cancelled') {
    return this.status;
  }

  const now = dayjs().utc(); // Get current time in UTC
  const startDateTime = this.getStartDateTime();
  const endDateTime = this.getEndDateTime();

  // Handle case where startDateTime is null
  if (!startDateTime || !endDateTime) {
    console.warn(`Tournament ${this._id} has invalid date/time data`);
    return this.status; // Return current status as fallback
  }

  const startDayjs = dayjs(startDateTime).utc();
  const endDayjs = dayjs(endDateTime).utc();

  if (now.isBefore(startDayjs)) {
    return 'upcoming';
  } else if (now.isBetween(startDayjs, endDayjs, null, '[]')) {
    return 'active';
  } else {
    return 'completed';
  }
});

// Helper method to combine startDate and startTime with proper error handling
TournamentSchema.methods.getStartDateTime = function() {
  try {
    // Validate inputs
    if (!this.startDate) {
      console.error(`Tournament ${this._id} has no startDate`);
      return null;
    }

    if (!this.startTime || typeof this.startTime !== 'string') {
      console.error(`Tournament ${this._id} has invalid startTime:`, this.startTime);
      return null;
    }

    // Validate startTime format
    if (!/^\d{1,2}:\d{2}$/.test(this.startTime)) {
      console.error(`Tournament ${this._id} has malformed startTime:`, this.startTime);
      return null;
    }

    const startDate = new Date(this.startDate);
    
    // Check if startDate is valid
    if (isNaN(startDate.getTime())) {
      console.error(`Tournament ${this._id} has invalid startDate:`, this.startDate);
      return null;
    }

    const [hours, minutes] = this.startTime.split(':').map(Number);
    
    // Validate parsed time values
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.error(`Tournament ${this._id} has invalid time values - hours: ${hours}, minutes: ${minutes}`);
      return null;
    }
    
    // Create date string in YYYY-MM-DD format
    const dateString = startDate.toISOString().split('T')[0];
    
    // Use Day.js for proper timezone handling
    if (this.timezone && this.timezone !== 'UTC') {
      try {
        // Create datetime in user's timezone, then convert to UTC
        const localDateTime = dayjs.tz(`${dateString} ${this.startTime}`, this.timezone);
        const utcDateTime = localDateTime.utc();
        
        console.log(`Tournament ${this._id} - Local time: ${localDateTime.format()}, Timezone: ${this.timezone}, UTC: ${utcDateTime.format()}`);
        
        return utcDateTime.toDate();
      } catch (timezoneError) {
        console.error(`Error handling timezone ${this.timezone} for tournament ${this._id}:`, timezoneError);
        // Fallback to simple date creation
        startDate.setHours(hours, minutes, 0, 0);
        return startDate;
      }
    } else {
      // UTC timezone - use simple date creation
      startDate.setHours(hours, minutes, 0, 0);
      return startDate;
    }
  } catch (error) {
    console.error(`Error calculating start date/time for tournament ${this._id}:`, error);
    return null;
  }
};

// Helper method to calculate end time with error handling
TournamentSchema.methods.getEndDateTime = function() {
  try {
    const startDateTime = this.getStartDateTime();
    
    if (!startDateTime) {
      return null;
    }

    if (!this.duration || typeof this.duration !== 'number' || this.duration <= 0) {
      console.error(`Tournament ${this._id} has invalid duration:`, this.duration);
      return null;
    }

    // Use Day.js for consistent timezone handling
    const startDayjs = dayjs(startDateTime);
    const endDayjs = startDayjs.add(this.duration, 'millisecond');
    
    return endDayjs.toDate();
  } catch (error) {
    console.error(`Error calculating end date/time for tournament ${this._id}:`, error);
    return null;
  }
};

// Method to get current time in tournament's timezone
TournamentSchema.methods.getCurrentTimeInTournamentTimezone = function() {
  try {
    const now = dayjs().utc();
    if (this.timezone && this.timezone !== 'UTC') {
      return now.tz(this.timezone);
    }
    return now;
  } catch (error) {
    console.error(`Error getting current time in timezone ${this.timezone}:`, error);
    return dayjs().utc();
  }
};

// Method to update status based on current time
TournamentSchema.methods.updateStatusBasedOnTime = function() {
  if (!this.manualStatusOverride && this.status !== 'cancelled') {
    try {
      const calculatedStatus = this.currentStatus;
      const previousStatus = this.status;
      
      if (this.status !== calculatedStatus) {
        this.status = calculatedStatus;
        
        // Track actual start/end times with proper timezone handling
        const now = dayjs().utc().toDate(); // Store in UTC for consistency
        
        if (calculatedStatus === 'active' && previousStatus === 'upcoming' && !this.actualStartTime) {
          this.actualStartTime = now;
          console.log(`Tournament ${this._id} started at ${dayjs(now).format()}`);
        } else if (calculatedStatus === 'completed' && previousStatus === 'active' && !this.actualEndTime) {
          this.actualEndTime = now;
          console.log(`Tournament ${this._id} ended at ${dayjs(now).format()}`);
        }
        
        return true; // Status was updated
      }
    } catch (error) {
      console.error(`Error updating status for tournament ${this._id}:`, error);
    }
  }
  return false; // No update needed
};

// Method to check if tournament is starting within specified minutes
TournamentSchema.methods.isStartingWithinMinutes = function(minutes) {
  try {
    const now = dayjs().utc();
    const startDateTime = this.getStartDateTime();
    
    if (!startDateTime) {
      return false;
    }
    
    const startDayjs = dayjs(startDateTime).utc();
    const timeDiff = startDayjs.diff(now, 'minute');
    
    return timeDiff >= 0 && timeDiff <= minutes;
  } catch (error) {
    console.error(`Error checking if tournament ${this._id} is starting within ${minutes} minutes:`, error);
    return false;
  }
};

// Method to get tournament time information
TournamentSchema.methods.getTimeInfo = function() {
  try {
    const startDateTime = this.getStartDateTime();
    const endDateTime = this.getEndDateTime();
    const now = dayjs().utc();
    
    if (!startDateTime || !endDateTime) {
      return null;
    }
    
    const startDayjs = dayjs(startDateTime).utc();
    const endDayjs = dayjs(endDateTime).utc();
    
    return {
      startDateTime: startDayjs.toDate(),
      endDateTime: endDayjs.toDate(),
      startDateTimeFormatted: startDayjs.format('YYYY-MM-DD HH:mm:ss UTC'),
      endDateTimeFormatted: endDayjs.format('YYYY-MM-DD HH:mm:ss UTC'),
      currentTime: now.toDate(),
      currentTimeFormatted: now.format('YYYY-MM-DD HH:mm:ss UTC'),
      minutesUntilStart: startDayjs.diff(now, 'minute'),
      minutesUntilEnd: endDayjs.diff(now, 'minute'),
      durationHours: this.duration / (1000 * 60 * 60),
      timezone: this.timezone
    };
  } catch (error) {
    console.error(`Error getting time info for tournament ${this._id}:`, error);
    return null;
  }
};

// Pre-save hook to update status automatically
TournamentSchema.pre('save', function(next) {
  try {
    this.updateStatusBasedOnTime();
    next();
  } catch (error) {
    console.error(`Error in pre-save hook for tournament ${this._id}:`, error);
    next(error);
  }
});

// Ensure virtual fields are included in JSON output
TournamentSchema.set('toJSON', { virtuals: true });
TournamentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Tournament', TournamentSchema);
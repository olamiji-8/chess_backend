const mongoose = require('mongoose');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isBetween = require('dayjs/plugin/isBetween');

// Extend dayjs with timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

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
        // Accept both 12-hour and 24-hour formats
        return /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i.test(v);
      },
      message: 'Start time must be in HH:MM or HH:MM AM/PM format'
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
  manualStatusOverride: {
    type: Boolean,
    default: false
  },
  actualStartTime: {
    type: Date,
    default: null
  },
  actualEndTime: {
    type: Date,
    default: null
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
  fiveMinuteReminderSent: {
    type: Boolean,
    default: false
  }
});

// Helper method to normalize time format (convert 12-hour to 24-hour)
TournamentSchema.methods.normalizeTimeFormat = function(timeString) {
  try {
    if (!timeString || typeof timeString !== 'string') {
      throw new Error('Invalid time string');
    }

    const timeStr = timeString.trim().toUpperCase();
    
    // Check if it's 12-hour format (contains AM/PM)
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      const isPM = timeStr.includes('PM');
      const timeOnly = timeStr.replace(/\s?(AM|PM)/i, '');
      const [hours, minutes] = timeOnly.split(':').map(Number);
      
      if (isNaN(hours) || isNaN(minutes)) {
        throw new Error('Invalid time format');
      }
      
      let hour24 = hours;
      
      // Convert 12-hour to 24-hour
      if (isPM && hours !== 12) {
        hour24 = hours + 12;
      } else if (!isPM && hours === 12) {
        hour24 = 0;
      }
      
      return `${hour24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } else {
      // Already in 24-hour format, just validate
      const [hours, minutes] = timeString.split(':').map(Number);
      
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error('Invalid time values');
      }
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  } catch (error) {
    console.error(`Error normalizing time format for "${timeString}":`, error);
    return null;
  }
};

// Improved method to get start date/time with better error handling
TournamentSchema.methods.getStartDateTime = function() {
  try {
    // Validate inputs
    if (!this.startDate) {
      console.error(`Tournament ${this._id} has no startDate`);
      return null;
    }

    if (!this.startTime) {
      console.error(`Tournament ${this._id} has no startTime`);
      return null;
    }

    // Normalize time format (handle both 12-hour and 24-hour)
    const normalizedTime = this.normalizeTimeFormat(this.startTime);
    if (!normalizedTime) {
      console.error(`Tournament ${this._id} has invalid startTime format:`, this.startTime);
      return null;
    }

    // Get clean date string
    const startDate = new Date(this.startDate);
    if (isNaN(startDate.getTime())) {
      console.error(`Tournament ${this._id} has invalid startDate:`, this.startDate);
      return null;
    }

    // Create date string in YYYY-MM-DD format
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    console.log(`Tournament ${this._id} - Processing:`);
    console.log(`  Date: ${dateString}`);
    console.log(`  Original Time: ${this.startTime}`);
    console.log(`  Normalized Time: ${normalizedTime}`);
    console.log(`  Timezone: ${this.timezone}`);
    
    // Handle timezone conversion
    const timezone = this.timezone || 'UTC';
    
    try {
      // Create datetime string
      const datetimeString = `${dateString} ${normalizedTime}`;
      console.log(`  DateTime String: ${datetimeString}`);
      
      let tournamentDateTime;
      
      if (timezone === 'UTC') {
        // Direct UTC parsing
        tournamentDateTime = dayjs.utc(`${dateString}T${normalizedTime}:00`);
      } else {
        // Parse in specified timezone, then convert to UTC
        tournamentDateTime = dayjs.tz(datetimeString, timezone).utc();
      }
      
      if (!tournamentDateTime.isValid()) {
        console.error(`Invalid datetime created for tournament ${this._id}`);
        return null;
      }
      
      console.log(`  Final UTC DateTime: ${tournamentDateTime.format('YYYY-MM-DD HH:mm:ss')} UTC`);
      console.log(`  ISO String: ${tournamentDateTime.toISOString()}`);
      
      return tournamentDateTime.toDate();
      
    } catch (timezoneError) {
      console.error(`Timezone error for tournament ${this._id}:`, timezoneError);
      // Fallback to UTC
      const fallbackDateTime = dayjs.utc(`${dateString}T${normalizedTime}:00`);
      console.log(`  Fallback UTC DateTime: ${fallbackDateTime.toISOString()}`);
      return fallbackDateTime.toDate();
    }
    
  } catch (error) {
    console.error(`Error calculating start date/time for tournament ${this._id}:`, error);
    return null;
  }
};

// Helper method to calculate end time
// Improved method to get start date/time with better error handling
TournamentSchema.methods.getStartDateTime = function() {
  try {
    // Validate inputs
    if (!this.startDate) {
      console.error(`Tournament ${this._id} has no startDate`);
      return null;
    }

    if (!this.startTime) {
      console.error(`Tournament ${this._id} has no startTime`);
      return null;
    }

    // Normalize time format (handle both 12-hour and 24-hour)
    const normalizedTime = this.normalizeTimeFormat(this.startTime);
    if (!normalizedTime) {
      console.error(`Tournament ${this._id} has invalid startTime format:`, this.startTime);
      return null;
    }

    // FIXED: Get date components without timezone conversion
    const startDateObj = new Date(this.startDate);
    if (isNaN(startDateObj.getTime())) {
      console.error(`Tournament ${this._id} has invalid startDate:`, this.startDate);
      return null;
    }

    // FIXED: Use UTC methods to avoid timezone shifts
    const year = startDateObj.getUTCFullYear();
    const month = String(startDateObj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(startDateObj.getUTCDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    console.log(`Tournament ${this._id} - Processing:`);
    console.log(`  Original startDate: ${this.startDate}`);
    console.log(`  Date (UTC): ${dateString}`);
    console.log(`  Original Time: ${this.startTime}`);
    console.log(`  Normalized Time: ${normalizedTime}`);
    console.log(`  Timezone: ${this.timezone}`);
    
    // Handle timezone conversion
    const timezone = this.timezone || 'UTC';
    
    try {
      // Create datetime string
      const datetimeString = `${dateString} ${normalizedTime}`;
      console.log(`  DateTime String: ${datetimeString}`);
      
      let tournamentDateTime;
      
      if (timezone === 'UTC') {
        // FIXED: Use proper UTC parsing
        tournamentDateTime = dayjs.utc(`${dateString}T${normalizedTime}:00.000Z`);
      } else {
        // FIXED: Parse in specified timezone, then convert to UTC
        tournamentDateTime = dayjs.tz(datetimeString, timezone).utc();
      }
      
      if (!tournamentDateTime.isValid()) {
        console.error(`Invalid datetime created for tournament ${this._id}`);
        return null;
      }
      
      console.log(`  Final UTC DateTime: ${tournamentDateTime.format('YYYY-MM-DD HH:mm:ss')} UTC`);
      console.log(`  ISO String: ${tournamentDateTime.toISOString()}`);
      
      return tournamentDateTime.toDate();
      
    } catch (timezoneError) {
      console.error(`Timezone error for tournament ${this._id}:`, timezoneError);
      // FIXED: Better fallback handling
      const fallbackDateTime = dayjs.utc(`${dateString}T${normalizedTime}:00.000Z`);
      console.log(`  Fallback UTC DateTime: ${fallbackDateTime.toISOString()}`);
      return fallbackDateTime.toDate();
    }
    
  } catch (error) {
    console.error(`Error calculating start date/time for tournament ${this._id}:`, error);
    return null;
  }
};

// Virtual field to calculate real-time status
TournamentSchema.virtual('currentStatus').get(function() {
  if (this.manualStatusOverride || this.status === 'cancelled') {
    return this.status;
  }

  const now = dayjs().utc();
  const startDateTime = this.getStartDateTime();
  const endDateTime = this.getEndDateTime();

  if (!startDateTime || !endDateTime) {
    console.warn(`Tournament ${this._id} has invalid date/time data`);
    return this.status;
  }

  const startDayjs = dayjs(startDateTime).utc();
  const endDayjs = dayjs(endDateTime).utc();

  console.log(`Tournament ${this._id} status calculation:`);
  console.log(`  Current time: ${now.format('YYYY-MM-DD HH:mm:ss')} UTC`);
  console.log(`  Start time: ${startDayjs.format('YYYY-MM-DD HH:mm:ss')} UTC`);
  console.log(`  End time: ${endDayjs.format('YYYY-MM-DD HH:mm:ss')} UTC`);
  console.log(`  Minutes until start: ${startDayjs.diff(now, 'minute', true)}`);
  console.log(`  Minutes until end: ${endDayjs.diff(now, 'minute', true)}`);

  if (now.isBefore(startDayjs)) {
    console.log(`  Status: upcoming (current time is before start)`);
    return 'upcoming';
  } else if (now.isBetween(startDayjs, endDayjs, null, '[]')) {
    console.log(`  Status: active (current time is between start and end)`);
    return 'active';
  } else {
    console.log(`  Status: completed (current time is after end)`);
    return 'completed';
  }
});

// Method to update status based on current time
TournamentSchema.methods.updateStatusBasedOnTime = function() {
  if (!this.manualStatusOverride && this.status !== 'cancelled') {
    try {
      const calculatedStatus = this.currentStatus;
      const previousStatus = this.status;
      
      console.log(`Tournament ${this._id} status check: ${previousStatus} → ${calculatedStatus}`);
      
      if (this.status !== calculatedStatus) {
        this.status = calculatedStatus;
        
        const now = dayjs().utc().toDate();
        
        if (calculatedStatus === 'active' && previousStatus === 'upcoming' && !this.actualStartTime) {
          this.actualStartTime = now;
          console.log(`Tournament ${this._id} started at ${dayjs(now).format('YYYY-MM-DD HH:mm:ss')} UTC`);
        } else if (calculatedStatus === 'completed' && previousStatus === 'active' && !this.actualEndTime) {
          this.actualEndTime = now;
          console.log(`Tournament ${this._id} ended at ${dayjs(now).format('YYYY-MM-DD HH:mm:ss')} UTC`);
        }
        
        console.log(`Tournament ${this._id} status updated from ${previousStatus} to ${calculatedStatus}`);
        return true;
      } else {
        console.log(`Tournament ${this._id} status remains ${this.status}`);
      }
    } catch (error) {
      console.error(`Error updating status for tournament ${this._id}:`, error);
    }
  }
  return false;
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
    const timeDiff = startDayjs.diff(now, 'minute', true);
    
    console.log(`Tournament ${this._id} timing check:`);
    console.log(`  Current time: ${now.format('YYYY-MM-DD HH:mm:ss')} UTC`);
    console.log(`  Start time: ${startDayjs.format('YYYY-MM-DD HH:mm:ss')} UTC`);
    console.log(`  Time difference: ${timeDiff} minutes`);
    console.log(`  Checking if starting within ${minutes} minutes: ${timeDiff >= 0 && timeDiff <= minutes}`);
    
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
      minutesUntilStart: startDayjs.diff(now, 'minute', true),
      minutesUntilEnd: endDayjs.diff(now, 'minute', true),
      durationHours: this.duration / (1000 * 60 * 60),
      timezone: this.timezone,
      originalStartTime: this.startTime,
      normalizedStartTime: this.normalizeTimeFormat(this.startTime)
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
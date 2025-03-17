const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false
  },
  profilePic: {
    type: String,
    default: 'default-profile.jpg'
  },
  phoneNumber: {
    type: String,
    trim: true
  },
lichessUsername: {
  type: String,
  trim: true,
  sparse: true, 
  index: true
},
lichessAccessToken: {
  type: String,
  select: false // hide in queries unless needed
},
  isVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  bankDetails: {
    bankName: String,
    accountNumber: String,
    accountName: String
  },
  registeredTournaments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament'
  }],
  createdTournaments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tournament'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash the password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
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
    default: 'https://res.cloudinary.com/dxd1j0yzt/image/upload/v1743781047/IMG-20250404-WA0131_tvlbpz.jpg',
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
  hasPin: {
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
  pin: {
    type: String,
    select: false 
  },
  bankDetails: {
    accountNumber: String,
    accountName: String,
    bankCode: String,
    bankName: String
  },
  
  bankVerification: {
    code: String,
    createdAt: Date,
    verified: Boolean
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
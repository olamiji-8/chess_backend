const mongoose = require('mongoose');
const User = require('../models/User');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const readline = require('readline');

// Load environment variables
dotenv.config();

// Create readline interface for command-line input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB Connected'))
.catch(err => {
  console.error('Error connecting to MongoDB:', err);
  process.exit(1);
});

// Function to create a new admin user
async function createAdminUser(userData) {
  try {
    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      console.log('A user with this email already exists. Use the setUserAsAdmin function instead.');
      return;
    }

    // Create new admin user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);

    const newAdmin = new User({
      fullName: userData.fullName,
      email: userData.email,
      password: hashedPassword, // We're manually hashing here since we're bypassing the pre-save middleware
      role: 'admin',
      isVerified: true // Auto-verify admin accounts
    });

    await newAdmin.save();
    console.log(`Admin user created successfully: ${userData.email}`);
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
}

// Function to set an existing user as admin
async function setUserAsAdmin(email) {
  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found with email:', email);
      return;
    }

    // Set user role to admin
    user.role = 'admin';
    await user.save();

    console.log(`User ${email} has been set as admin successfully`);
  } catch (error) {
    console.error('Error setting user as admin:', error);
  }
}

// Function to list all admin users
async function listAdminUsers() {
  try {
    const adminUsers = await User.find({ role: 'admin' }).select('fullName email');
    
    console.log('\nCurrent Admin Users:');
    if (adminUsers.length === 0) {
      console.log('No admin users found');
    } else {
      adminUsers.forEach(admin => {
        console.log(`- ${admin.fullName} (${admin.email})`);
      });
    }
  } catch (error) {
    console.error('Error listing admin users:', error);
  }
}

// Main menu function
function showMenu() {
  console.log('\n====== ADMIN USER MANAGEMENT ======');
  console.log('1. Create a new admin user');
  console.log('2. Set an existing user as admin');
  console.log('3. List all admin users');
  console.log('4. Exit');
  
  rl.question('\nSelect an option (1-4): ', async (answer) => {
    switch (answer) {
      case '1':
        // Create new admin user
        rl.question('Enter full name: ', (fullName) => {
          rl.question('Enter email: ', (email) => {
            rl.question('Enter password (min 6 characters): ', async (password) => {
              if (password.length < 6) {
                console.log('Password must be at least 6 characters long');
                showMenu();
              } else {
                await createAdminUser({ fullName, email, password });
                showMenu();
              }
            });
          });
        });
        break;
        
      case '2':
        // Set existing user as admin
        rl.question('Enter user email: ', async (email) => {
          await setUserAsAdmin(email);
          showMenu();
        });
        break;
        
      case '3':
        // List admin users
        await listAdminUsers();
        showMenu();
        break;
        
      case '4':
        // Exit
        console.log('Exiting admin management tool');
        rl.close();
        mongoose.disconnect();
        process.exit(0);
        break;
        
      default:
        console.log('Invalid option. Please try again.');
        showMenu();
    }
  });
}

// Start the CLI
console.log('Admin User Management Tool');
showMenu();

// Handle program termination
rl.on('close', () => {
  mongoose.disconnect();
  process.exit(0);
});
// Routes for user-related endpoints
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Create or get user by username
router.post('/', userController.createOrGetUser);

// Check if username exists
router.get('/check/:username', userController.checkUsername);

// Get user details
router.get('/:userId', userController.getUserDetails);

// Get leaderboard
router.get('/leaderboard/top', userController.getLeaderboard);

module.exports = router;
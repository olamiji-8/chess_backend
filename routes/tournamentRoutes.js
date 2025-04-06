const express = require('express');
const router = express.Router();
const { 
  createTournament, 
  getTournaments, 
  getTournament,
  registerForTournament,
  checkTournamentRegistration,
  updateTournamentStatus
} = require('../controllers/tournamentController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Public routes
router.get('/', getTournaments);
router.get('/:id', getTournament);

// Protected routes
router.post('/', protect, upload.single('banner'), createTournament);
router.get('/:id/registration-check', protect, checkTournamentRegistration);
router.post('/:id/register', protect, registerForTournament);
router.put('/:id/status', protect, updateTournamentStatus);

module.exports = router;
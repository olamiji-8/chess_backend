const express = require('express');
const router = express.Router();
const { 
  createTournament, 
  getTournaments, 
  getTournament,
  registerForTournament
} = require('../controllers/tournamentController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.route('/')
  .post(protect, upload.single('banner'), createTournament)
  .get(getTournaments);

router.route('/:id')
  .get(getTournament);

router.route('/:id/register')
  .post(protect, registerForTournament);

module.exports = router;
// const express = require('express');
// const router = express.Router();
// const adminController = require('../controllers/adminPuzzleController');
// const { admin } = require('../middleware/authMiddleware');

// // Admin puzzle routes
// router.get('/puzzles', admin, adminController.getAllPuzzles);
// router.post('/puzzles', admin, adminController.createPuzzle);
// router.put('/puzzles/:id', admin, adminController.updatePuzzle);
// router.delete('/puzzles/:id', admin, adminController.deletePuzzle);
// router.post('/puzzles/batch', admin, adminController.addBatchPuzzles);

// // Admin reward routes
// router.get('/rewards', admin, adminController.getRewards);
// router.post('/rewards', admin, adminController.upsertReward);

// module.exports = router;
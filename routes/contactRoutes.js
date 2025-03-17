const express = require('express');
const router = express.Router();
const { sendContactMessage } = require('../controllers/contactController');
const { protect } = require('../middleware/authMiddleware');

router.post('/',protect, sendContactMessage);

module.exports = router;
const express = require('express');
const router = express.Router();
const generatePKCE = require('../server/utils/pkce');

router.get('/auth/lichess/pkce', (req, res) => {
  const { code_verifier, code_challenge } = generatePKCE();

  // Save the verifier in memory or session (for demo)
  req.session = req.session || {};
  req.session.code_verifier = code_verifier;

  res.json({ code_verifier, code_challenge });
});

module.exports = router;

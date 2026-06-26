'use strict';
/**
 * Setup API — lets the frontend save the Google Client ID to the .env file
 * and update process.env immediately so no server restart is required.
 */
const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const ENV_PATH = path.resolve(__dirname, '../../.env');

// POST /api/setup/google-client
// Body: { clientId: "xxxx.apps.googleusercontent.com" }
router.post('/google-client', (req, res) => {
  const { clientId } = req.body;

  if (!clientId || typeof clientId !== 'string') {
    return res.status(400).json({ error: 'clientId is required' });
  }

  // Validate Google Client ID format
  const GOOG_CLIENT_RE = /^\d{12,}-[a-z0-9]+\.apps\.googleusercontent\.com$/;
  if (!GOOG_CLIENT_RE.test(clientId.trim())) {
    return res.status(400).json({
      error: 'That does not look like a valid Google Client ID. ' +
             'It should end with .apps.googleusercontent.com',
    });
  }

  const id = clientId.trim();

  // 1. Apply immediately to the running process (no restart needed)
  process.env.GOOGLE_CLIENT_ID = id;

  // 2. Persist to .env file
  try {
    let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
    if (/^GOOGLE_CLIENT_ID=/m.test(content)) {
      content = content.replace(/^GOOGLE_CLIENT_ID=.*/m, `GOOGLE_CLIENT_ID=${id}`);
    } else {
      content = content.trimEnd() + `\nGOOGLE_CLIENT_ID=${id}\n`;
    }
    fs.writeFileSync(ENV_PATH, content, 'utf8');
  } catch (writeErr) {
    // File write failed (permissions?) — still works for this session
    console.warn('[setup] Could not write .env:', writeErr.message);
  }

  res.json({ success: true, message: 'Google Client ID saved. You can now connect Google Drive.' });
});

// GET /api/setup/status — returns current configuration state
router.get('/status', (req, res) => {
  const id = process.env.GOOGLE_CLIENT_ID || '';
  res.json({
    googleClientIdSet: id.length > 10 && id.includes('.apps.googleusercontent.com'),
    partialId: id ? id.slice(0, 12) + '…' : null,
  });
});

module.exports = router;

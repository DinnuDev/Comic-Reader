'use strict';

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');

const router = express.Router();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const parts = (stored || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const candidate = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hash, 'hex');
  if (candidate.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(candidate, storedBuf);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    created_at: user.created_at,
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

router.post('/signup', (req, res) => {
  const email = (req.body?.email || '').trim().toLowerCase();
  const username = (req.body?.username || '').trim();
  const password = req.body?.password || '';

  if (!validEmail(email)) {
    return res.status(400).json({ error: 'Please provide a valid email.' });
  }
  if (username.length < 2 || username.length > 40) {
    return res.status(400).json({ error: 'Username must be 2-40 characters.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account already exists for this email.' });
  }

  const existingUsername = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get(username);
  if (existingUsername) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  const id = uuidv4();
  const password_hash = hashPassword(password);

  db.prepare(
    'INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)'
  ).run(id, email, username, password_hash);

  const user = db.prepare('SELECT id, email, username, created_at FROM users WHERE id = ?').get(id);

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Unable to create session.' });
    req.session.userId = user.id;
    res.status(201).json({ user: sanitizeUser(user) });
  });
});

router.post('/login', (req, res) => {
  const identifier = (req.body?.identifier || req.body?.email || req.body?.username || '').trim();
  const password = req.body?.password || '';

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Invalid username/email or password.' });
  }

  const candidates = db
    .prepare('SELECT * FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?) ORDER BY created_at DESC')
    .all(identifier, identifier);

  const user = candidates.find((candidate) => verifyPassword(password, candidate.password_hash)) || null;

  if (!user) {
    return res.status(401).json({ error: 'Invalid username/email or password.' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Unable to create session.' });
    req.session.userId = user.id;
    res.json({ user: sanitizeUser(user) });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    res.json({ success: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = db.prepare('SELECT id, email, username, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({ user: sanitizeUser(user) });
});

module.exports = router;

// ============================================================
// routes/users.js — User search API
// ============================================================

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const userService = require('../services/userService');

// All routes require authentication
router.use(requireAuth);

// ── POST /api/v1/users/resolve ──
// Resolve a single user by Golf ID or email (exact match, not search)
router.post('/resolve', async (req, res) => {
  try {
    const { type, value } = req.body || {};

    if (!type || !value || typeof value !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_request', message: 'type and value are required' });
    }

    const result = await userService.resolveUser(type, value.trim(), req.userId);

    if (result.error) {
      const status = result.error === 'user_not_found' ? 404
                   : result.error === 'self_lookup' ? 400
                   : 400;
      return res.status(status).json({ ok: false, error: result.error, message: result.message });
    }

    res.json({ ok: true, data: result.user });
  } catch (err) {
    console.error('[users/resolve]', err);
    res.status(500).json({ ok: false, error: 'server_error', message: 'Failed to resolve user' });
  }
});

// ── GET /api/v1/users/search?q=<query> ──
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Query too short (minimum 2 characters)' });
    }

    const results = await userService.searchUsers(q, req.userId);
    res.json({ users: results });
  } catch (err) {
    console.error('[users/search]', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

module.exports = router;

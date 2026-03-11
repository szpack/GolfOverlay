// ============================================================
// routes/rounds.js — Round CRUD + HoleScore API (Sync v1)
// ============================================================
// All routes require authentication.
// All operations enforce round ownership via ownerUserId.
// Write endpoints return minimal { id, serverVersion, updatedAt }.

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const roundService = require('../services/roundService');

// All routes require auth
router.use(requireAuth);

// ════════════════════════════════════════════
// ROUND CRUD
// ════════════════════════════════════════════

// ── POST /api/v1/rounds ──
// Create a round. Idempotent: same id + same owner = return existing.
router.post('/', async (req, res) => {
  try {
    const result = await roundService.createRound(req.userId, req.body);

    if (result.error === 'validation') {
      return res.status(400).json({ error: result.error, messages: result.messages });
    }
    if (result.error === 'conflict') {
      return res.status(409).json({ error: result.message });
    }

    const status = result.created ? 201 : 200;
    res.status(status).json(result.round);
  } catch (err) {
    console.error('[rounds/create]', err);
    res.status(500).json({ error: 'Failed to create round' });
  }
});

// ── GET /api/v1/rounds ──
// List user's rounds. Supports ?updated_after=ISO&status=X&limit=N
router.get('/', async (req, res) => {
  try {
    const result = await roundService.listRounds(req.userId, {
      updatedAfter:      req.query.updated_after,
      status:            req.query.status,
      limit:             req.query.limit,
      includeSoftDeleted: req.query.include_deleted === 'true'
    });

    if (result.error) {
      return res.status(400).json({ error: result.error, messages: result.messages });
    }

    res.json(result);
  } catch (err) {
    console.error('[rounds/list]', err);
    res.status(500).json({ error: 'Failed to list rounds' });
  }
});

// ── GET /api/v1/rounds/:id ──
// Get a single round with full detail.
router.get('/:id', async (req, res) => {
  try {
    const round = await roundService.getRound(req.userId, req.params.id);
    if (!round) {
      return res.status(404).json({ error: 'Round not found' });
    }
    res.json({ round });
  } catch (err) {
    console.error('[rounds/get]', err);
    res.status(500).json({ error: 'Failed to fetch round' });
  }
});

// ── PATCH /api/v1/rounds/:id ──
// Update round meta fields.
router.patch('/:id', async (req, res) => {
  try {
    const result = await roundService.updateRound(req.userId, req.params.id, req.body);

    if (result.error === 'validation') {
      return res.status(400).json({ error: result.error, messages: result.messages });
    }
    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Round not found' });
    }

    res.json(result.round);
  } catch (err) {
    console.error('[rounds/update]', err);
    res.status(500).json({ error: 'Failed to update round' });
  }
});

// ── POST /api/v1/rounds/:id/finish ──
router.post('/:id/finish', async (req, res) => {
  try {
    const result = await roundService.finishRound(req.userId, req.params.id, req.body);

    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Round not found' });
    }
    if (result.error === 'invalid_transition') {
      return res.status(409).json({ error: result.message });
    }

    res.json(result.round);
  } catch (err) {
    console.error('[rounds/finish]', err);
    res.status(500).json({ error: 'Failed to finish round' });
  }
});

// ── POST /api/v1/rounds/:id/abandon ──
router.post('/:id/abandon', async (req, res) => {
  try {
    const result = await roundService.abandonRound(req.userId, req.params.id, req.body);

    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Round not found' });
    }
    if (result.error === 'invalid_transition') {
      return res.status(409).json({ error: result.message });
    }

    res.json(result.round);
  } catch (err) {
    console.error('[rounds/abandon]', err);
    res.status(500).json({ error: 'Failed to abandon round' });
  }
});

// ── POST /api/v1/rounds/:id/reopen ──
router.post('/:id/reopen', async (req, res) => {
  try {
    const result = await roundService.reopenRound(req.userId, req.params.id);

    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Round not found' });
    }
    if (result.error === 'invalid_transition') {
      return res.status(409).json({ error: result.message });
    }
    if (result.error === 'locked') {
      return res.status(409).json({ error: result.message });
    }

    res.json(result.round);
  } catch (err) {
    console.error('[rounds/reopen]', err);
    res.status(500).json({ error: 'Failed to reopen round' });
  }
});

// ── DELETE /api/v1/rounds/:id ──
// Soft-delete.
router.delete('/:id', async (req, res) => {
  try {
    const result = await roundService.deleteRound(req.userId, req.params.id);

    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Round not found' });
    }

    res.json(result.round);
  } catch (err) {
    console.error('[rounds/delete]', err);
    res.status(500).json({ error: 'Failed to delete round' });
  }
});

// ════════════════════════════════════════════
// HOLE SCORES
// ════════════════════════════════════════════

// ── GET /api/v1/rounds/:id/hole-scores ──
// Get all hole scores for a round.
router.get('/:id/hole-scores', async (req, res) => {
  try {
    const result = await roundService.listHoleScores(req.userId, req.params.id);

    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Round not found' });
    }

    res.json(result);
  } catch (err) {
    console.error('[rounds/hole-scores/list]', err);
    res.status(500).json({ error: 'Failed to list hole scores' });
  }
});

// ── PUT /api/v1/rounds/:id/holes/:holeNo/scores ──
// Upsert hole scores for a specific hole.
router.put('/:id/holes/:holeNo/scores', async (req, res) => {
  try {
    const holeNo = parseInt(req.params.holeNo, 10);
    const result = await roundService.upsertHoleScores(
      req.userId, req.params.id, holeNo, req.body
    );

    if (result.error === 'validation') {
      return res.status(400).json({ error: result.error, messages: result.messages });
    }
    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Round not found' });
    }

    res.json(result);
  } catch (err) {
    console.error('[rounds/hole-scores/upsert]', err);
    res.status(500).json({ error: 'Failed to upsert hole scores' });
  }
});

module.exports = router;

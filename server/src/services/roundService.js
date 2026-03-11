// ============================================================
// roundService.js — Round + HoleScore business logic (Sync v1)
// ============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Enum whitelists ──
const VALID_STATUS = ['scheduled', 'in_progress', 'finished', 'abandoned'];
const VALID_VISIBILITY = ['private', 'friends', 'public'];
const VALID_LOCK_STATE = ['open', 'grace', 'locked'];
const VALID_ENDED_BY = ['manual', 'auto'];

// ── Status transition rules (mirrors client RoundStore) ──
const STATUS_TRANSITIONS = {
  scheduled:   ['in_progress', 'abandoned'],
  in_progress: ['finished', 'abandoned'],
  finished:    ['in_progress'],  // reopen
  abandoned:   ['in_progress']   // reopen
};

// ── Helpers ──

/** Full detail — for GET /rounds/:id */
function _roundResponse(round) {
  return {
    id:                   round.id,
    ownerUserId:          round.ownerUserId,
    status:               round.status,
    visibility:           round.visibility,
    lockState:            round.lockState,
    clubId:               round.clubId,
    courseId:              round.courseId,
    courseName:           round.courseName,
    routingName:          round.routingName,
    date:                 round.date,
    teeTime:              round.teeTime,
    startedAt:            round.startedAt,
    endedAt:              round.endedAt,
    endedBy:              round.endedBy,
    reopenUntil:          round.reopenUntil,
    reopenCount:          round.reopenCount,
    lastActivityAt:       round.lastActivityAt,
    holesPlanned:         round.holesPlanned,
    holesCompleted:       round.holesCompleted,
    playersSnapshotJson:  round.playersSnapshotJson,
    courseSnapshotJson:    round.courseSnapshotJson,
    settingsSnapshotJson: round.settingsSnapshotJson,
    serverVersion:        round.serverVersion,
    createdAt:            round.createdAt,
    updatedAt:            round.updatedAt,
    deletedAt:            round.deletedAt
  };
}

/** Summary — for GET /rounds list. No heavy JSON snapshot columns. */
function _roundSummaryResponse(round) {
  return {
    id:              round.id,
    status:          round.status,
    visibility:      round.visibility,
    lockState:       round.lockState,
    courseName:      round.courseName,
    routingName:     round.routingName,
    date:            round.date,
    teeTime:         round.teeTime,
    startedAt:       round.startedAt,
    endedAt:         round.endedAt,
    endedBy:         round.endedBy,
    reopenUntil:     round.reopenUntil,
    holesPlanned:    round.holesPlanned,
    holesCompleted:  round.holesCompleted,
    serverVersion:   round.serverVersion,
    createdAt:       round.createdAt,
    updatedAt:       round.updatedAt,
    deletedAt:       round.deletedAt
  };
}

function _writeResponse(round) {
  return {
    id:            round.id,
    serverVersion: round.serverVersion,
    updatedAt:     round.updatedAt
  };
}

function _holeScoreResponse(hs) {
  return {
    id:             hs.id,
    roundId:        hs.roundId,
    holeNo:         hs.holeNo,
    roundPlayerId:  hs.roundPlayerId,
    playerId:       hs.playerId,
    gross:          hs.gross,
    notes:          hs.notes,
    serverVersion:  hs.serverVersion,
    createdAt:      hs.createdAt,
    updatedAt:      hs.updatedAt
  };
}

function _holeScoreWriteResponse(hs) {
  return {
    id:             hs.id,
    serverVersion:  hs.serverVersion,
    updatedAt:      hs.updatedAt
  };
}

// ── Validation helpers ──

function validateRoundCreate(body) {
  const errors = [];
  if (!body.id || typeof body.id !== 'string' || body.id.length > 64) {
    errors.push('id is required (string, max 64 chars)');
  }
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    errors.push('date is required (YYYY-MM-DD)');
  }
  if (body.status && !VALID_STATUS.includes(body.status)) {
    errors.push('status must be one of: ' + VALID_STATUS.join(', '));
  }
  if (body.visibility && !VALID_VISIBILITY.includes(body.visibility)) {
    errors.push('visibility must be one of: ' + VALID_VISIBILITY.join(', '));
  }
  if (body.holesPlanned != null) {
    const hp = Number(body.holesPlanned);
    if (!Number.isInteger(hp) || hp < 1 || hp > 36) {
      errors.push('holesPlanned must be integer 1-36');
    }
  }
  return errors;
}

function validateRoundUpdate(body) {
  const errors = [];
  if (body.status !== undefined && !VALID_STATUS.includes(body.status)) {
    errors.push('status must be one of: ' + VALID_STATUS.join(', '));
  }
  if (body.visibility !== undefined && !VALID_VISIBILITY.includes(body.visibility)) {
    errors.push('visibility must be one of: ' + VALID_VISIBILITY.join(', '));
  }
  if (body.lockState !== undefined && !VALID_LOCK_STATE.includes(body.lockState)) {
    errors.push('lockState must be one of: ' + VALID_LOCK_STATE.join(', '));
  }
  if (body.endedBy !== undefined && body.endedBy !== null && !VALID_ENDED_BY.includes(body.endedBy)) {
    errors.push('endedBy must be one of: ' + VALID_ENDED_BY.join(', '));
  }
  if (body.holesPlanned != null) {
    const hp = Number(body.holesPlanned);
    if (!Number.isInteger(hp) || hp < 1 || hp > 36) {
      errors.push('holesPlanned must be integer 1-36');
    }
  }
  if (body.holesCompleted != null) {
    const hc = Number(body.holesCompleted);
    if (!Number.isInteger(hc) || hc < 0 || hc > 36) {
      errors.push('holesCompleted must be integer 0-36');
    }
  }
  return errors;
}

// ════════════════════════════════════════════
// ROUND CRUD
// ════════════════════════════════════════════

/**
 * Create a round. Idempotent: same id + same owner = return existing.
 */
async function createRound(userId, body) {
  const errors = validateRoundCreate(body);
  if (errors.length) return { error: 'validation', messages: errors };

  // Idempotent check
  const existing = await prisma.round.findUnique({ where: { id: body.id } });
  if (existing) {
    if (existing.ownerUserId !== userId) {
      return { error: 'conflict', message: 'Round ID already exists' };
    }
    // Same owner, safe replay — return existing
    return { round: _writeResponse(existing), created: false };
  }

  const round = await prisma.round.create({
    data: {
      id:                   body.id,
      ownerUserId:          userId,
      status:               body.status || 'scheduled',
      visibility:           body.visibility || 'private',
      lockState:            body.lockState || 'open',
      clubId:               body.clubId || null,
      courseId:              body.courseId || null,
      courseName:           body.courseName || '',
      routingName:          body.routingName || '',
      date:                 body.date,
      teeTime:              body.teeTime ? new Date(body.teeTime) : null,
      startedAt:            body.startedAt ? new Date(body.startedAt) : null,
      endedAt:              body.endedAt ? new Date(body.endedAt) : null,
      endedBy:              VALID_ENDED_BY.includes(body.endedBy) ? body.endedBy : null,
      reopenUntil:          body.reopenUntil ? new Date(body.reopenUntil) : null,
      reopenCount:          Number(body.reopenCount) || 0,
      lastActivityAt:       body.lastActivityAt ? new Date(body.lastActivityAt) : null,
      holesPlanned:         Number(body.holesPlanned) || 18,
      holesCompleted:       Number(body.holesCompleted) || 0,
      playersSnapshotJson:  body.playersSnapshotJson || null,
      courseSnapshotJson:    body.courseSnapshotJson || null,
      settingsSnapshotJson: body.settingsSnapshotJson || null
    }
  });

  return { round: _writeResponse(round), created: true };
}

/**
 * List rounds for a user. Supports updated_after for incremental pull.
 */
async function listRounds(userId, opts = {}) {
  const where = { ownerUserId: userId };

  // Include soft-deleted for sync (client needs to know about deletions)
  // But default to non-deleted for normal listing
  if (opts.includeSoftDeleted) {
    // no deletedAt filter
  } else {
    where.deletedAt = null;
  }

  if (opts.status) {
    if (!VALID_STATUS.includes(opts.status)) {
      return { error: 'validation', messages: ['Invalid status filter'] };
    }
    where.status = opts.status;
  }

  if (opts.updatedAfter) {
    const d = new Date(opts.updatedAfter);
    if (isNaN(d.getTime())) {
      return { error: 'validation', messages: ['Invalid updated_after date'] };
    }
    where.updatedAt = { gt: d };
  }

  const rounds = await prisma.round.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: Math.min(Number(opts.limit) || 100, 200)
  });

  return { rounds: rounds.map(_roundSummaryResponse) };
}

/** Common ownership query: non-deleted round belonging to user. */
const _ownRound = (userId, roundId) => ({ id: roundId, ownerUserId: userId, deletedAt: null });

/**
 * Get a single round by ID. Ownership check included.
 */
async function getRound(userId, roundId) {
  const round = await prisma.round.findFirst({
    where: _ownRound(userId, roundId)
  });
  if (!round) return null;
  return _roundResponse(round);
}

// ── PATCH field whitelist ──
// Only these fields can be set via PATCH /rounds/:id.
// Status transitions must use dedicated action endpoints (finish/abandon/reopen).
const PATCHABLE_FIELDS = [
  'visibility', 'teeTime', 'date',
  'clubId', 'courseId', 'courseName', 'routingName',
  'holesPlanned', 'holesCompleted', 'lastActivityAt',
  'playersSnapshotJson', 'courseSnapshotJson', 'settingsSnapshotJson'
];

/**
 * Update round meta fields. serverVersion increments on success.
 * base_version check: if provided and mismatched, log warning but proceed (v1 conservative).
 */
async function updateRound(userId, roundId, body) {
  const errors = validateRoundUpdate(body);
  if (errors.length) return { error: 'validation', messages: errors };

  const existing = await prisma.round.findFirst({
    where: _ownRound(userId, roundId)
  });
  if (!existing) return { error: 'not_found' };

  // base_version advisory check (v1: warn only, don't reject)
  if (body.baseVersion != null && body.baseVersion !== existing.serverVersion) {
    console.warn(`[round/update] version mismatch: client base=${body.baseVersion}, server=${existing.serverVersion}, roundId=${roundId}`);
  }

  // Build update data — only whitelisted fields
  const data = { serverVersion: existing.serverVersion + 1 };

  if (body.visibility !== undefined)           data.visibility = body.visibility;
  if (body.teeTime !== undefined)              data.teeTime = body.teeTime ? new Date(body.teeTime) : null;
  if (body.date !== undefined)                 data.date = body.date;
  if (body.clubId !== undefined)               data.clubId = body.clubId;
  if (body.courseId !== undefined)              data.courseId = body.courseId;
  if (body.courseName !== undefined)           data.courseName = body.courseName;
  if (body.routingName !== undefined)          data.routingName = body.routingName;
  if (body.holesPlanned !== undefined)         data.holesPlanned = Number(body.holesPlanned);
  if (body.holesCompleted !== undefined)       data.holesCompleted = Number(body.holesCompleted);
  if (body.lastActivityAt !== undefined)       data.lastActivityAt = body.lastActivityAt ? new Date(body.lastActivityAt) : null;
  if (body.playersSnapshotJson !== undefined)  data.playersSnapshotJson = body.playersSnapshotJson;
  if (body.courseSnapshotJson !== undefined)    data.courseSnapshotJson = body.courseSnapshotJson;
  if (body.settingsSnapshotJson !== undefined) data.settingsSnapshotJson = body.settingsSnapshotJson;

  const updated = await prisma.round.update({
    where: { id: roundId },
    data
  });

  return { round: _writeResponse(updated) };
}

/**
 * Status action: finish a round.
 */
async function finishRound(userId, roundId, body = {}) {
  const existing = await prisma.round.findFirst({
    where: _ownRound(userId, roundId)
  });
  if (!existing) return { error: 'not_found' };

  const allowed = STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes('finished')) {
    return { error: 'invalid_transition', message: `Cannot finish a ${existing.status} round` };
  }

  const now = new Date();
  const reopenUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const updated = await prisma.round.update({
    where: { id: roundId },
    data: {
      status:        'finished',
      endedAt:       body.endedAt ? new Date(body.endedAt) : now,
      endedBy:       VALID_ENDED_BY.includes(body.endedBy) ? body.endedBy : 'manual',
      lockState:     'grace',
      reopenUntil:   body.reopenUntil ? new Date(body.reopenUntil) : reopenUntil,
      serverVersion: existing.serverVersion + 1
    }
  });

  return { round: _writeResponse(updated) };
}

/**
 * Status action: abandon a round.
 */
async function abandonRound(userId, roundId, body = {}) {
  const existing = await prisma.round.findFirst({
    where: _ownRound(userId, roundId)
  });
  if (!existing) return { error: 'not_found' };

  const allowed = STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes('abandoned')) {
    return { error: 'invalid_transition', message: `Cannot abandon a ${existing.status} round` };
  }

  const updated = await prisma.round.update({
    where: { id: roundId },
    data: {
      status:        'abandoned',
      endedAt:       body.endedAt ? new Date(body.endedAt) : new Date(),
      endedBy:       VALID_ENDED_BY.includes(body.endedBy) ? body.endedBy : 'manual',
      lockState:     'locked',
      serverVersion: existing.serverVersion + 1
    }
  });

  return { round: _writeResponse(updated) };
}

/**
 * Status action: reopen a round.
 * Only allowed from finished (grace) or abandoned. Not from scheduled or in_progress.
 */
async function reopenRound(userId, roundId) {
  const existing = await prisma.round.findFirst({
    where: _ownRound(userId, roundId)
  });
  if (!existing) return { error: 'not_found' };

  // Only finished and abandoned can reopen
  if (existing.status !== 'finished' && existing.status !== 'abandoned') {
    return { error: 'invalid_transition', message: `Cannot reopen a ${existing.status} round` };
  }

  // For finished rounds, check grace window (locked = expired)
  if (existing.status === 'finished' && existing.lockState === 'locked') {
    return { error: 'locked', message: 'Grace window has expired, round is locked' };
  }

  const updated = await prisma.round.update({
    where: { id: roundId },
    data: {
      status:         'in_progress',
      endedAt:        null,
      endedBy:        null,
      lockState:      'open',
      reopenUntil:    null,
      reopenCount:    existing.reopenCount + 1,
      serverVersion:  existing.serverVersion + 1
    }
  });

  return { round: _writeResponse(updated) };
}

/**
 * Soft-delete a round. Only non-deleted rounds can be deleted.
 */
async function deleteRound(userId, roundId) {
  const existing = await prisma.round.findFirst({
    where: _ownRound(userId, roundId)
  });
  if (!existing) return { error: 'not_found' };

  const updated = await prisma.round.update({
    where: { id: roundId },
    data: {
      deletedAt:     new Date(),
      serverVersion: existing.serverVersion + 1
    }
  });

  return { round: _writeResponse(updated) };
}

// ════════════════════════════════════════════
// HOLE SCORE
// ════════════════════════════════════════════

/**
 * Get all hole scores for a round. Ownership + non-deleted via Round.
 */
async function listHoleScores(userId, roundId) {
  const round = await prisma.round.findFirst({
    where: _ownRound(userId, roundId)
  });
  if (!round) return { error: 'not_found' };

  const scores = await prisma.holeScore.findMany({
    where: { roundId, deletedAt: null },
    orderBy: [{ holeNo: 'asc' }, { roundPlayerId: 'asc' }]
  });

  return { scores: scores.map(_holeScoreResponse) };
}

/**
 * Upsert hole scores for a specific hole in a round.
 * Semantics: per-entry upsert. Existing scores for entries NOT in the request are untouched.
 */
async function upsertHoleScores(userId, roundId, holeNo, body) {
  if (!Number.isInteger(holeNo) || holeNo < 1 || holeNo > 36) {
    return { error: 'validation', messages: ['holeNo must be integer 1-36'] };
  }

  const round = await prisma.round.findFirst({
    where: _ownRound(userId, roundId)
  });
  if (!round) return { error: 'not_found' };

  const scores = body.scores;
  if (!Array.isArray(scores) || scores.length === 0) {
    return { error: 'validation', messages: ['scores array is required'] };
  }

  // Validate each score entry
  for (const s of scores) {
    if (!s.roundPlayerId || typeof s.roundPlayerId !== 'string') {
      return { error: 'validation', messages: ['Each score must have a roundPlayerId'] };
    }
    if (s.gross != null && (!Number.isInteger(s.gross) || s.gross < 0 || s.gross > 20)) {
      return { error: 'validation', messages: ['gross must be integer 0-20'] };
    }
  }

  // Upsert each score in a transaction
  const results = await prisma.$transaction(
    scores.map(s =>
      prisma.holeScore.upsert({
        where: {
          roundId_holeNo_roundPlayerId: {
            roundId,
            holeNo,
            roundPlayerId: s.roundPlayerId
          }
        },
        create: {
          roundId,
          holeNo,
          roundPlayerId:  s.roundPlayerId,
          playerId:       s.playerId || null,
          gross:          s.gross != null ? s.gross : null,
          notes:          s.notes || null,
          serverVersion:  1
        },
        update: {
          gross:          s.gross != null ? s.gross : null,
          notes:          s.notes !== undefined ? (s.notes || null) : undefined,
          playerId:       s.playerId !== undefined ? (s.playerId || null) : undefined,
          serverVersion:  { increment: 1 }
        }
      })
    )
  );

  return {
    holeNo,
    scores: results.map(_holeScoreWriteResponse)
  };
}

module.exports = {
  createRound,
  listRounds,
  getRound,
  updateRound,
  finishRound,
  abandonRound,
  reopenRound,
  deleteRound,
  listHoleScores,
  upsertHoleScores
};

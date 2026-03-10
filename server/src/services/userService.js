// ============================================================
// userService.js — User + Player read/update
// ============================================================

const { PrismaClient } = require('@prisma/client');
const { _sanitizeUser, _sanitizePlayer } = require('./authService');

const prisma = new PrismaClient();

// ── Golf ID generation ──
// Range: 000101 ~ 999999 (000000 ~ 000100 reserved)

function _randomGolfId() {
  const num = Math.floor(Math.random() * 999899) + 101;
  return String(num).padStart(6, '0');
}

/**
 * Generate a unique 6-digit Golf ID with collision retry.
 * @param {object} tx - Prisma transaction client (or prisma itself)
 * @returns {Promise<string>}
 */
async function generateGolfId(tx) {
  const db = tx || prisma;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = _randomGolfId();
    const exists = await db.user.findUnique({ where: { golfId: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  throw new Error('Failed to generate unique Golf ID after 10 attempts');
}

// ── Get /me data ──
async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      authIdentities: { select: { provider: true, isPrimary: true, verifiedAt: true } },
      players: { where: { isDefault: true, status: 'active' }, take: 1 }
    }
  });

  if (!user) return null;

  return {
    user: _sanitizeUser(user),
    defaultPlayer: user.players[0] ? _sanitizePlayer(user.players[0]) : null,
    authProviders: user.authIdentities.map(a => ({
      provider: a.provider,
      isPrimary: a.isPrimary,
      verified: !!a.verifiedAt
    }))
  };
}

// ── Update user display name ──
async function updateMe(userId, { displayName }) {
  const data = {};
  if (displayName !== undefined) data.displayName = displayName.trim();
  if (Object.keys(data).length === 0) return null;

  const user = await prisma.user.update({
    where: { id: userId },
    data
  });
  return _sanitizeUser(user);
}

// ── Get default player ──
async function getDefaultPlayer(userId) {
  const player = await prisma.player.findFirst({
    where: { ownerUserId: userId, isDefault: true, status: 'active' }
  });
  return player ? _sanitizePlayer(player) : null;
}

// ── Update default player ──
async function updateDefaultPlayer(userId, { displayName, handicap, avatarBase64 }) {
  const player = await prisma.player.findFirst({
    where: { ownerUserId: userId, isDefault: true, status: 'active' }
  });
  if (!player) return null;

  const data = {};
  if (displayName !== undefined) data.displayName = displayName.trim();
  if (handicap !== undefined) data.handicap = handicap;

  // Avatar base64 support: store data URI in avatarUrl field
  if (avatarBase64 !== undefined) {
    if (avatarBase64 === null) {
      data.avatarUrl = null;
    } else {
      if (typeof avatarBase64 !== 'string' || !avatarBase64.startsWith('data:image/')) {
        throw Object.assign(new Error('Invalid avatar format, must be a data:image/* URI'), { code: 'INVALID_AVATAR' });
      }
      if (avatarBase64.length > 700000) {
        throw Object.assign(new Error('Avatar too large (max ~500KB)'), { code: 'AVATAR_TOO_LARGE' });
      }
      data.avatarUrl = avatarBase64;
    }
  }

  if (Object.keys(data).length === 0) return _sanitizePlayer(player);

  const updated = await prisma.player.update({
    where: { id: player.id },
    data
  });
  return _sanitizePlayer(updated);
}

// ── Search users by UUID prefix or displayName ──
async function searchUsers(query, excludeUserId) {
  const isUuidPrefix = /^[0-9a-f-]{4,}$/i.test(query);

  let users;
  if (isUuidPrefix && query.length >= 4) {
    // Search by UUID prefix
    users = await prisma.user.findMany({
      where: {
        id: { startsWith: query.toLowerCase() },
        status: 'active',
        NOT: { id: excludeUserId }
      },
      include: {
        players: { where: { isDefault: true, status: 'active' }, take: 1 }
      },
      take: 10
    });
  } else if (query.length >= 2) {
    // Search by displayName (case-insensitive contains)
    users = await prisma.user.findMany({
      where: {
        displayName: { contains: query, mode: 'insensitive' },
        status: 'active',
        NOT: { id: excludeUserId }
      },
      include: {
        players: { where: { isDefault: true, status: 'active' }, take: 1 }
      },
      take: 10
    });
  } else {
    return [];
  }

  return users.map(u => ({
    id: u.id,
    displayName: u.displayName,
    avatarUrl: u.players[0]?.avatarUrl || null
  }));
}

// ── Resolve user by Golf ID or email (exact match) ──

async function resolveUser(type, value, requestingUserId) {
  if (!type || !value) return { error: 'type and value are required' };

  let user;

  if (type === 'golf_id') {
    if (!/^\d{6}$/.test(value)) {
      return { error: 'invalid_golf_id', message: 'Golf ID must be exactly 6 digits' };
    }
    user = await prisma.user.findUnique({
      where: { golfId: value },
      select: { id: true, golfId: true, displayName: true, status: true }
    });
  } else if (type === 'email') {
    const normalized = value.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      return { error: 'invalid_email', message: 'Please enter a valid email address' };
    }
    user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, golfId: true, displayName: true, status: true }
    });
  } else {
    return { error: 'invalid_type', message: 'Type must be "golf_id" or "email"' };
  }

  if (!user || user.status !== 'active') {
    return { error: 'user_not_found', message: 'No user found' };
  }

  if (user.id === requestingUserId) {
    return { error: 'self_lookup', message: 'That is your own account' };
  }

  return {
    user: {
      userId: user.id,
      displayName: user.displayName,
      golfId: user.golfId
    }
  };
}

module.exports = { getMe, updateMe, getDefaultPlayer, updateDefaultPlayer, searchUsers, generateGolfId, resolveUser };

// ============================================================
// syncCoordinator.js — Central sync orchestrator
//
// Bridges RoundStore ↔ SyncQueue ↔ PushEngine ↔ PullEngine.
// Only this module calls SyncQueue.enqueue().
// Only this module calls PushEngine.start/stop/nudge.
// Only this module triggers PullEngine pulls.
//
// Depends on: SyncQueue, PushEngine, PullEngine, AuthState, RoundStore
// Loaded after all cloud modules, before app.js
// ============================================================

var SyncCoordinator = (function(){

  var _initialized = false;

  // ── Init: wire up callbacks & start engine ────────────────

  function init(){
    if(_initialized) return;
    _initialized = true;

    // Listen for auth changes
    if(typeof AuthState !== 'undefined'){
      AuthState.onChange(function(state){
        if(state.loggedIn){
          PushEngine.start();
          // Pull summaries on login
          _pullOnLogin();
        } else {
          PushEngine.stop();
        }
      });
    }

    // Wire PushEngine callbacks
    PushEngine.onSuccess(_handlePushSuccess);
    PushEngine.onConflict(_handlePushConflict);

    // Start engine if already logged in
    if(typeof AuthState !== 'undefined' && AuthState.isLoggedIn()){
      PushEngine.start();
      _pullOnLogin();
    }
  }

  // ── Enqueue helpers (called by RoundStore applyLocal*) ────

  function _userId(){
    if(typeof AuthState !== 'undefined' && AuthState.getUser()){
      return AuthState.getUser().id;
    }
    return '';
  }

  /**
   * Enqueue round creation.
   * @param {string} roundId
   * @param {object} payload - Full round create payload for POST /rounds
   */
  function enqueueRoundCreate(roundId, payload){
    if(!_userId()) return; // not logged in, skip
    SyncQueue.enqueue({
      entityType:  'round',
      entityId:    roundId,
      operation:   'create',
      payload:     payload,
      baseVersion: 0,
      userId:      _userId()
    });
    PushEngine.nudge();
  }

  /**
   * Enqueue round meta update.
   * @param {string} roundId
   * @param {object} payload - PATCH fields
   * @param {number} serverVersion - current serverVersion (0 if never synced)
   */
  function enqueueRoundUpdate(roundId, payload, serverVersion){
    if(!_userId()) return;
    // Try coalesce first
    if(!SyncQueue.coalesce(roundId, 'update', payload)){
      SyncQueue.enqueue({
        entityType:  'round',
        entityId:    roundId,
        operation:   'update',
        payload:     payload,
        baseVersion: serverVersion || 0,
        userId:      _userId()
      });
    }
    PushEngine.nudge();
  }

  /**
   * Enqueue round finish.
   * @param {string} roundId
   * @param {object} payload - { endedBy, ... }
   * @param {number} serverVersion
   */
  function enqueueRoundFinish(roundId, payload, serverVersion){
    if(!_userId()) return;
    SyncQueue.enqueue({
      entityType:  'round',
      entityId:    roundId,
      operation:   'finish',
      payload:     payload || {},
      baseVersion: serverVersion || 0,
      userId:      _userId()
    });
    PushEngine.nudge();
  }

  /**
   * Enqueue round abandon.
   * @param {string} roundId
   * @param {object} payload
   * @param {number} serverVersion
   */
  function enqueueRoundAbandon(roundId, payload, serverVersion){
    if(!_userId()) return;
    SyncQueue.enqueue({
      entityType:  'round',
      entityId:    roundId,
      operation:   'abandon',
      payload:     payload || {},
      baseVersion: serverVersion || 0,
      userId:      _userId()
    });
    PushEngine.nudge();
  }

  /**
   * Enqueue round reopen.
   * @param {string} roundId
   * @param {number} serverVersion
   */
  function enqueueRoundReopen(roundId, serverVersion){
    if(!_userId()) return;
    SyncQueue.enqueue({
      entityType:  'round',
      entityId:    roundId,
      operation:   'reopen',
      payload:     {},
      baseVersion: serverVersion || 0,
      userId:      _userId()
    });
    PushEngine.nudge();
  }

  /**
   * Enqueue round soft-delete.
   * @param {string} roundId
   * @param {number} serverVersion
   */
  function enqueueRoundDelete(roundId, serverVersion){
    if(!_userId()) return;
    SyncQueue.enqueue({
      entityType:  'round',
      entityId:    roundId,
      operation:   'delete',
      payload:     {},
      baseVersion: serverVersion || 0,
      userId:      _userId()
    });
    PushEngine.nudge();
  }

  /**
   * Enqueue hole score upsert (called from onScoreFlush).
   * @param {string} roundId
   * @param {number} holeNo
   * @param {object[]} scores - array of { roundPlayerId, playerId, gross, notes }
   * @param {number} serverVersion
   */
  function enqueueScoreUpsert(roundId, holeNo, scores, serverVersion){
    if(!_userId()) return;
    var entityId = roundId; // entity is the round
    var payload = { holeNo: holeNo, scores: scores };

    // Coalesce: same round + same operation → replace
    // We use a composite key for coalesce: roundId:holeNo
    var coalesceKey = roundId + ':hole:' + holeNo;
    if(!SyncQueue.coalesce(coalesceKey, 'upsert_scores', payload)){
      SyncQueue.enqueue({
        entityType:  'hole_score',
        entityId:    coalesceKey,
        operation:   'upsert_scores',
        payload:     payload,
        baseVersion: serverVersion || 0,
        userId:      _userId()
      });
    }
    PushEngine.nudge();
  }

  // ── Score flush hook (called by RoundStore.flushProgress) ─

  /**
   * Called when RoundStore flushes dirty scores.
   * Examines dirtyFlags and enqueues appropriate sync entries.
   * @param {string} roundId
   * @param {object} summary - round summary with sync metadata
   * @param {object} dirtyHoles - { [holeNo]: true } map of dirty holes
   * @param {object} roundData - full round data
   */
  function onScoreFlush(roundId, summary, dirtyHoles, roundData){
    if(!_userId()) return;
    if(!summary || !roundData) return;

    var sv = (summary.sync && summary.sync.serverVersion) || 0;

    // Enqueue score upsert for each dirty hole
    var holeNos = Object.keys(dirtyHoles || {});
    for(var i = 0; i < holeNos.length; i++){
      var holeNo = parseInt(holeNos[i], 10);
      if(isNaN(holeNo)) continue;

      // Build scores array for this hole from roundData
      var scores = _extractHoleScores(roundData, holeNo);
      if(scores.length > 0){
        enqueueScoreUpsert(roundId, holeNo, scores, sv);
      }
    }

    // If meta dirty, enqueue round update
    if(summary.dirtyFlags && summary.dirtyFlags.meta){
      var metaPayload = _extractMetaPayload(summary, roundData);
      enqueueRoundUpdate(roundId, metaPayload, sv);
    }
  }

  /**
   * Extract score entries for a specific hole from round data.
   * RoundData structure: { playersSnapshot: [...], scores: { [rpId]: { holes: [...] } } }
   * @param {object} roundData
   * @param {number} holeNo - 1-based
   * @returns {object[]}
   */
  function _extractHoleScores(roundData, holeNo){
    var results = [];
    var playersSnap = (roundData && roundData.playersSnapshot) || [];
    var allScores = (roundData && roundData.scores) || {};
    var holeIdx = holeNo - 1; // Convert to 0-based index

    for(var i = 0; i < playersSnap.length; i++){
      var pSnap = playersSnap[i];
      var rpId = pSnap.roundPlayerId;
      if(!rpId) continue;

      var pScores = allScores[rpId];
      if(!pScores || !pScores.holes) continue;

      var h = pScores.holes[holeIdx];
      if(!h) continue;

      results.push({
        roundPlayerId: rpId,
        playerId:      pSnap.playerId || null,
        gross:         (h.gross != null) ? h.gross : null,
        notes:         h.notes || null
      });
    }
    return results;
  }

  /**
   * Extract PATCH-able meta fields from summary + data.
   * @param {object} summary
   * @param {object} roundData
   * @returns {object}
   */
  function _extractMetaPayload(summary, roundData){
    return {
      holesCompleted:      summary.holesCompleted || 0,
      lastActivityAt:      summary.lastActivityAt || null,
      playersSnapshotJson: (roundData && roundData.playersSnapshot) || null,
      courseSnapshotJson:   (roundData && roundData.courseSnapshot) || null
    };
  }

  // ── PushEngine callbacks ──────────────────────────────────

  function _handlePushSuccess(entry, result){
    // Update serverVersion in RoundStore summary
    if(entry.entity_type === 'round' && result.data){
      _updateSyncMeta(entry.entity_id, {
        serverVersion: result.data.serverVersion || result.data.server_version,
        lastSyncedAt:  new Date().toISOString()
      });
    }
    // For hole_score, update round's sync meta too
    if(entry.entity_type === 'hole_score'){
      // entity_id is roundId:hole:N — extract roundId
      var parts = entry.entity_id.split(':hole:');
      var roundId = parts[0];
      if(roundId && result.data){
        _updateSyncMeta(roundId, {
          lastSyncedAt: new Date().toISOString()
        });
      }
    }
  }

  function _handlePushConflict(entry, result){
    console.warn('[SyncCoordinator] push conflict:', entry.entity_type, entry.entity_id,
      result.status, result.data);

    // Log conflict
    if(typeof ConflictResolver !== 'undefined'){
      ConflictResolver.appendLogs([{
        ts:          new Date().toISOString(),
        roundId:     entry.entity_id.split(':hole:')[0],
        field:       'push.' + entry.operation,
        localValue:  entry.payload,
        remoteValue: result.data,
        winner:      'remote',
        reason:      'push-rejected-' + result.status
      }]);
    }

    // For 409 on round operations, pull latest to sync state
    if(entry.entity_type === 'round' && result.status === 409){
      if(typeof PullEngine !== 'undefined'){
        PullEngine.pullRoundDetail(entry.entity_id);
      }
    }
  }

  /**
   * Update sync metadata on a round summary in RoundStore.
   * @param {string} roundId
   * @param {object} meta - { serverVersion, lastSyncedAt }
   */
  function _updateSyncMeta(roundId, meta){
    if(typeof RoundStore === 'undefined') return;
    var summary = RoundStore.getSummary(roundId);
    if(!summary) return;

    if(!summary.sync) summary.sync = {};
    if(meta.serverVersion != null){
      summary.sync.serverVersion = meta.serverVersion;
    }
    if(meta.lastSyncedAt){
      summary.sync.lastSyncedAt = meta.lastSyncedAt;
    }
    summary.sync.syncStatus = 'synced';

    RoundStore.putSummary(roundId, summary);
  }

  // ── Pull triggers ──────────────────────────────────────────

  /**
   * Pull summaries on login/startup. Non-blocking.
   */
  function _pullOnLogin(){
    if(typeof PullEngine === 'undefined') return;
    // Find latest lastSyncedAt across all summaries for incremental pull
    var latest = null;
    if(typeof RoundStore !== 'undefined'){
      var all = RoundStore.list({ limit: 0 });
      for(var i = 0; i < all.length; i++){
        var s = all[i];
        if(s.sync && s.sync.lastSyncedAt){
          if(!latest || s.sync.lastSyncedAt > latest) latest = s.sync.lastSyncedAt;
        }
      }
    }
    PullEngine.pullSummaries({ updatedAfter: latest, force: true });
  }

  /**
   * Pull round detail + scores when user opens a round.
   * Called by UI layer (e.g., roundHelper, app.js).
   *
   * @param {string} roundId
   * @returns {Promise<{ok: boolean, roundChanged: boolean, scoresChanged: boolean}>}
   */
  async function onRoundOpen(roundId){
    if(typeof PullEngine === 'undefined'){
      return { ok: false, roundChanged: false, scoresChanged: false };
    }
    return PullEngine.pullRoundDetail(roundId);
  }

  // ── Status query ──────────────────────────────────────────

  /**
   * Get sync status overview.
   * @returns {object}
   */
  function status(){
    return {
      pending:   SyncQueue.pendingCount(),
      failed:    SyncQueue.getByStatus('failed').length,
      conflicts: SyncQueue.getByStatus('conflict').length,
      running:   PushEngine.isRunning(),
      pulling:   typeof PullEngine !== 'undefined' && PullEngine.isPulling(),
      loggedIn:  typeof AuthState !== 'undefined' && AuthState.isLoggedIn()
    };
  }

  return {
    init:                init,
    enqueueRoundCreate:  enqueueRoundCreate,
    enqueueRoundUpdate:  enqueueRoundUpdate,
    enqueueRoundFinish:  enqueueRoundFinish,
    enqueueRoundAbandon: enqueueRoundAbandon,
    enqueueRoundReopen:  enqueueRoundReopen,
    enqueueRoundDelete:  enqueueRoundDelete,
    enqueueScoreUpsert:  enqueueScoreUpsert,
    onScoreFlush:        onScoreFlush,
    onRoundOpen:         onRoundOpen,
    status:              status
  };

})();

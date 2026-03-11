// ============================================================
// conflictResolver.js — Conservative conflict resolution
//
// Phase 2: last-write-wins for meta, updatedAt comparison for scores.
// All conflicts are logged for future inspection.
//
// Depends on: nothing (pure logic)
// ============================================================

var ConflictResolver = (function(){

  var LS_KEY = 'golf_v7_conflict_log';
  var MAX_LOG_ENTRIES = 200;

  // ── Conflict log entry ──
  // {
  //   ts:          ISO string,
  //   roundId:     string,
  //   field:       string,      // e.g. 'meta.status', 'score.hole3.rp1.gross'
  //   localValue:  any,
  //   remoteValue: any,
  //   winner:      'local' | 'remote',
  //   reason:      string       // e.g. 'last-write-wins', 'remote-newer', 'local-dirty'
  // }

  // ══════════════════════════════════════════
  // ROUND META RESOLUTION
  // ══════════════════════════════════════════

  /**
   * Resolve round meta fields between local summary and server round.
   * Strategy: last-write-wins based on updatedAt.
   * Exception: if local has dirty meta (dirtyFlags.meta=true), local wins for dirty fields.
   *
   * @param {Object} localSummary  - local RoundSummary
   * @param {Object} serverRound   - server response from GET /rounds/:id
   * @returns {Object} { merged: {fields to apply to local summary}, logs: [] }
   */
  function resolveRoundMeta(localSummary, serverRound){
    var logs = [];
    var merged = {};

    // Fields that server is authoritative for
    var SERVER_FIELDS = [
      'status', 'lockState', 'endedAt', 'endedBy',
      'reopenUntil', 'reopenCount', 'startedAt',
      'visibility', 'deletedAt'
    ];

    // Fields where last-write-wins applies
    var LWW_FIELDS = [
      'courseName', 'routingName', 'holesPlanned',
      'holesCompleted', 'lastActivityAt', 'date'
    ];

    var localDirtyMeta = localSummary.dirtyFlags && localSummary.dirtyFlags.meta;
    var localUpdated = localSummary.updatedAt || '';
    var serverUpdated = serverRound.updatedAt || '';

    // Server-authoritative fields: always take server value
    for(var i = 0; i < SERVER_FIELDS.length; i++){
      var f = SERVER_FIELDS[i];
      var sv = serverRound[f];
      var lv = localSummary[f];
      if(sv !== undefined && sv !== lv){
        merged[f] = sv;
        logs.push(_log(localSummary.id, 'meta.' + f, lv, sv, 'remote', 'server-authoritative'));
      }
    }

    // LWW fields: server wins unless local is dirty AND local is newer
    for(var j = 0; j < LWW_FIELDS.length; j++){
      var f2 = LWW_FIELDS[j];
      var sv2 = serverRound[f2];
      var lv2 = localSummary[f2];
      if(sv2 === undefined) continue;
      if(sv2 === lv2) continue;

      if(localDirtyMeta && localUpdated > serverUpdated){
        // Local dirty + newer → local wins, don't overwrite
        logs.push(_log(localSummary.id, 'meta.' + f2, lv2, sv2, 'local', 'local-dirty'));
      } else {
        merged[f2] = sv2;
        logs.push(_log(localSummary.id, 'meta.' + f2, lv2, sv2, 'remote', 'last-write-wins'));
      }
    }

    return { merged: merged, logs: logs };
  }

  // ══════════════════════════════════════════
  // HOLE SCORE RESOLUTION
  // ══════════════════════════════════════════

  /**
   * Resolve hole scores between local data and server scores.
   * Strategy: per hole+roundPlayerId, compare updatedAt. Newer wins.
   * If local hole is dirty (in dirtyHoles), local wins.
   *
   * @param {string} roundId
   * @param {Object} localData     - RoundData { scores: { [rpId]: { holes: [...] } }, ... }
   * @param {Object[]} serverScores - from GET /rounds/:id/hole-scores
   * @param {Object} dirtyHoles    - { [holeNo(1-based)]: true }
   * @returns {Object} { toApply: [{holeNo, rpId, gross, notes, updatedAt}], logs: [] }
   */
  function resolveHoleScores(roundId, localData, serverScores, dirtyHoles){
    var logs = [];
    var toApply = [];
    dirtyHoles = dirtyHoles || {};

    for(var i = 0; i < serverScores.length; i++){
      var ss = serverScores[i];
      var holeNo = ss.holeNo;       // 1-based
      var rpId = ss.roundPlayerId;
      var holeIdx = holeNo - 1;     // 0-based

      // Check if this hole is locally dirty
      if(dirtyHoles[holeNo]){
        logs.push(_log(roundId, 'score.hole' + holeNo + '.' + rpId + '.gross',
          _localGross(localData, rpId, holeIdx), ss.gross, 'local', 'local-dirty'));
        continue;
      }

      // Compare updatedAt
      var localHole = _getLocalHole(localData, rpId, holeIdx);
      var localUpdated = (localHole && localHole._remoteUpdatedAt) || '';
      var serverUpdated = ss.updatedAt || '';

      if(serverUpdated > localUpdated){
        // Server is newer — apply
        toApply.push({
          holeNo:    holeNo,
          holeIdx:   holeIdx,
          rpId:      rpId,
          gross:     ss.gross,
          notes:     ss.notes,
          updatedAt: ss.updatedAt
        });
        if(_localGross(localData, rpId, holeIdx) !== ss.gross){
          logs.push(_log(roundId, 'score.hole' + holeNo + '.' + rpId + '.gross',
            _localGross(localData, rpId, holeIdx), ss.gross, 'remote', 'remote-newer'));
        }
      } else {
        // Local same or newer — keep local
        if(_localGross(localData, rpId, holeIdx) !== ss.gross){
          logs.push(_log(roundId, 'score.hole' + holeNo + '.' + rpId + '.gross',
            _localGross(localData, rpId, holeIdx), ss.gross, 'local', 'local-newer'));
        }
      }
    }

    return { toApply: toApply, logs: logs };
  }

  // ── Helpers ───────────────────────────────

  function _getLocalHole(localData, rpId, holeIdx){
    if(!localData || !localData.scores || !localData.scores[rpId]) return null;
    var holes = localData.scores[rpId].holes || [];
    return holes[holeIdx] || null;
  }

  function _localGross(localData, rpId, holeIdx){
    var h = _getLocalHole(localData, rpId, holeIdx);
    return h ? h.gross : null;
  }

  function _log(roundId, field, localValue, remoteValue, winner, reason){
    return {
      ts:          new Date().toISOString(),
      roundId:     roundId,
      field:       field,
      localValue:  localValue,
      remoteValue: remoteValue,
      winner:      winner,
      reason:      reason
    };
  }

  // ══════════════════════════════════════════
  // CONFLICT LOG PERSISTENCE
  // ══════════════════════════════════════════

  function appendLogs(newLogs){
    if(!newLogs || newLogs.length === 0) return;
    var existing = loadLogs();
    existing = existing.concat(newLogs);
    // Trim to max
    if(existing.length > MAX_LOG_ENTRIES){
      existing = existing.slice(existing.length - MAX_LOG_ENTRIES);
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(existing));
    } catch(e){}
  }

  function loadLogs(){
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e){
      return [];
    }
  }

  function clearLogs(){
    try { localStorage.removeItem(LS_KEY); } catch(e){}
  }

  return {
    resolveRoundMeta:   resolveRoundMeta,
    resolveHoleScores:  resolveHoleScores,
    appendLogs:         appendLogs,
    loadLogs:           loadLogs,
    clearLogs:          clearLogs
  };

})();

// ============================================================
// syncQueue.js — Local-first sync queue (FIFO, localStorage)
//
// Persists pending changes for push to cloud.
// Entry shape is FIXED — do not modify without versioning.
// ============================================================

var SyncQueue = (function(){
  var LS_KEY = 'golf_v7_sync_queue';
  var _queue = null; // lazy-loaded

  // ── Entry shape (v1, frozen) ──────────────────────────────
  // {
  //   change_id:          string,   // unique id: chg_<timestamp>_<random>
  //   entity_type:        string,   // 'round' | 'hole_score'
  //   entity_id:          string,   // round id or composite key
  //   operation:          string,   // 'create'|'update'|'finish'|'abandon'|'reopen'|'delete'|'upsert_scores'
  //   payload:            object,   // data to send (operation-specific)
  //   base_version:       number,   // serverVersion at enqueue time (0 = never synced)
  //   status:             string,   // 'pending'|'syncing'|'synced'|'failed'|'conflict'
  //   retry_count:        number,
  //   last_error_code:    number|null,
  //   last_error_message: string|null,
  //   created_at:         string,   // ISO timestamp
  //   updated_at:         string,   // ISO timestamp
  //   device_id:          string,
  //   user_id:            string
  // }

  // ── Helpers ───────────────────────────────────────────────

  function _generateChangeId(){
    var ts = Date.now().toString(36);
    var rand = Math.random().toString(36).substring(2, 8);
    return 'chg_' + ts + '_' + rand;
  }

  function _load(){
    if(_queue !== null) return;
    try {
      var raw = localStorage.getItem(LS_KEY);
      _queue = raw ? JSON.parse(raw) : [];
    } catch(e){
      console.warn('[SyncQueue] load failed, resetting', e);
      _queue = [];
    }
  }

  function _persist(){
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(_queue));
    } catch(e){
      console.error('[SyncQueue] persist failed', e);
    }
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Enqueue a new sync entry.
   * @param {object} opts
   * @param {string} opts.entityType   - 'round' | 'hole_score'
   * @param {string} opts.entityId     - round id or composite key
   * @param {string} opts.operation    - operation name
   * @param {object} opts.payload      - data to send
   * @param {number} opts.baseVersion  - serverVersion (0 if never synced)
   * @param {string} opts.userId       - current user id
   * @returns {string} change_id
   */
  function enqueue(opts){
    _load();
    var now = new Date().toISOString();
    var entry = {
      change_id:          _generateChangeId(),
      entity_type:        opts.entityType,
      entity_id:          opts.entityId,
      operation:          opts.operation,
      payload:            opts.payload || {},
      base_version:       opts.baseVersion || 0,
      status:             'pending',
      retry_count:        0,
      last_error_code:    null,
      last_error_message: null,
      created_at:         now,
      updated_at:         now,
      device_id:          DeviceId.get(),
      user_id:            opts.userId
    };
    _queue.push(entry);
    _persist();
    return entry.change_id;
  }

  /**
   * Get next pending entry (FIFO).
   * @returns {object|null}
   */
  function peek(){
    _load();
    for(var i = 0; i < _queue.length; i++){
      if(_queue[i].status === 'pending') return _queue[i];
    }
    return null;
  }

  /**
   * Get all entries with given status.
   * @param {string} status
   * @returns {object[]}
   */
  function getByStatus(status){
    _load();
    return _queue.filter(function(e){ return e.status === status; });
  }

  /**
   * Mark entry as syncing (in-flight).
   * @param {string} changeId
   */
  function markSyncing(changeId){
    _load();
    var entry = _findById(changeId);
    if(entry){
      entry.status = 'syncing';
      entry.updated_at = new Date().toISOString();
      _persist();
    }
  }

  /**
   * Mark entry as synced (success). Removes from queue.
   * @param {string} changeId
   */
  function markSynced(changeId){
    _load();
    _queue = _queue.filter(function(e){ return e.change_id !== changeId; });
    _persist();
  }

  /**
   * Mark entry as failed with error info.
   * @param {string} changeId
   * @param {number} errorCode
   * @param {string} errorMessage
   */
  function markFailed(changeId, errorCode, errorMessage){
    _load();
    var entry = _findById(changeId);
    if(entry){
      entry.status = 'failed';
      entry.retry_count++;
      entry.last_error_code = errorCode || null;
      entry.last_error_message = errorMessage || null;
      entry.updated_at = new Date().toISOString();
      _persist();
    }
  }

  /**
   * Mark entry as conflict (server rejected, needs resolution).
   * @param {string} changeId
   * @param {number} errorCode
   * @param {string} errorMessage
   */
  function markConflict(changeId, errorCode, errorMessage){
    _load();
    var entry = _findById(changeId);
    if(entry){
      entry.status = 'conflict';
      entry.last_error_code = errorCode || null;
      entry.last_error_message = errorMessage || null;
      entry.updated_at = new Date().toISOString();
      _persist();
    }
  }

  /**
   * Reset failed entry back to pending for retry.
   * @param {string} changeId
   */
  function retryFailed(changeId){
    _load();
    var entry = _findById(changeId);
    if(entry && entry.status === 'failed'){
      entry.status = 'pending';
      entry.updated_at = new Date().toISOString();
      _persist();
    }
  }

  /**
   * Reset all failed entries back to pending.
   */
  function retryAllFailed(){
    _load();
    var changed = false;
    for(var i = 0; i < _queue.length; i++){
      if(_queue[i].status === 'failed'){
        _queue[i].status = 'pending';
        _queue[i].updated_at = new Date().toISOString();
        changed = true;
      }
    }
    if(changed) _persist();
  }

  /**
   * Remove a specific entry (e.g., discard conflict).
   * @param {string} changeId
   */
  function remove(changeId){
    _load();
    _queue = _queue.filter(function(e){ return e.change_id !== changeId; });
    _persist();
  }

  /**
   * Remove all synced/conflict entries older than maxAge ms.
   * @param {number} maxAge - milliseconds
   */
  function purgeOld(maxAge){
    _load();
    var cutoff = Date.now() - maxAge;
    var before = _queue.length;
    _queue = _queue.filter(function(e){
      if(e.status === 'pending' || e.status === 'syncing') return true;
      var ts = new Date(e.created_at).getTime();
      return ts > cutoff;
    });
    if(_queue.length !== before) _persist();
  }

  /**
   * Count of pending entries.
   * @returns {number}
   */
  function pendingCount(){
    _load();
    var count = 0;
    for(var i = 0; i < _queue.length; i++){
      if(_queue[i].status === 'pending') count++;
    }
    return count;
  }

  /**
   * Check if any entries exist for a given entity.
   * @param {string} entityId
   * @returns {boolean}
   */
  function hasPending(entityId){
    _load();
    for(var i = 0; i < _queue.length; i++){
      var e = _queue[i];
      if(e.entity_id === entityId && (e.status === 'pending' || e.status === 'syncing')){
        return true;
      }
    }
    return false;
  }

  /**
   * Coalesce: if a pending entry exists for same entity+operation, replace payload.
   * Returns true if coalesced, false if new enqueue needed.
   * Only coalesces 'update' and 'upsert_scores' operations.
   * @param {string} entityId
   * @param {string} operation
   * @param {object} newPayload
   * @returns {boolean}
   */
  function coalesce(entityId, operation, newPayload){
    if(operation !== 'update' && operation !== 'upsert_scores') return false;
    _load();
    for(var i = _queue.length - 1; i >= 0; i--){
      var e = _queue[i];
      if(e.entity_id === entityId && e.operation === operation && e.status === 'pending'){
        // Merge payload (shallow)
        if(operation === 'update'){
          for(var k in newPayload){
            if(newPayload.hasOwnProperty(k)) e.payload[k] = newPayload[k];
          }
        } else {
          // upsert_scores: replace entirely (scores are per-hole batch)
          e.payload = newPayload;
        }
        e.updated_at = new Date().toISOString();
        _persist();
        return true;
      }
    }
    return false;
  }

  /**
   * Get full queue snapshot (for debug panel).
   * @returns {object[]}
   */
  function snapshot(){
    _load();
    return _queue.slice();
  }

  /**
   * Clear entire queue (dangerous, for debug/reset only).
   */
  function clear(){
    _queue = [];
    _persist();
  }

  // ── Internal ──────────────────────────────────────────────

  function _findById(changeId){
    for(var i = 0; i < _queue.length; i++){
      if(_queue[i].change_id === changeId) return _queue[i];
    }
    return null;
  }

  // ── Expose ────────────────────────────────────────────────

  return {
    enqueue:        enqueue,
    peek:           peek,
    getByStatus:    getByStatus,
    markSyncing:    markSyncing,
    markSynced:     markSynced,
    markFailed:     markFailed,
    markConflict:   markConflict,
    retryFailed:    retryFailed,
    retryAllFailed: retryAllFailed,
    remove:         remove,
    purgeOld:       purgeOld,
    pendingCount:   pendingCount,
    hasPending:     hasPending,
    coalesce:       coalesce,
    snapshot:       snapshot,
    clear:          clear
  };
})();

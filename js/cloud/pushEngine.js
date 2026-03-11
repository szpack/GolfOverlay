// ============================================================
// pushEngine.js — Drains SyncQueue, pushes changes to cloud
//
// Depends on: ApiClient, SyncQueue, AuthState
// Loaded after: syncQueue.js, apiClient.js, authState.js
// ============================================================

var PushEngine = (function(){

  var _running   = false;
  var _timer     = null;
  var _paused    = false;

  // Retry backoff: 2s, 4s, 8s, 16s, 30s, 30s, ...
  var BASE_DELAY   = 2000;
  var MAX_DELAY    = 30000;
  var MAX_RETRIES  = 10;

  // Polling interval when idle (no pending items)
  var IDLE_POLL_MS = 60000;
  // Polling interval when active (items pending)
  var ACTIVE_POLL_MS = 1000;

  // ── Route map: operation → API call ───────────────────────

  /**
   * Execute a single queue entry against the API.
   * @param {object} entry - SyncQueue entry
   * @returns {Promise<{ok: boolean, status: number, data: object|null}>}
   */
  async function _dispatch(entry){
    var p = entry.payload;
    var id = entry.entity_id;

    switch(entry.entity_type + ':' + entry.operation){

      // ── Round operations ──
      case 'round:create':
        return _call(ApiClient.post('/api/v1/rounds', p));

      case 'round:update':
        return _call(ApiClient.patch('/api/v1/rounds/' + id, p));

      case 'round:finish':
        return _call(ApiClient.post('/api/v1/rounds/' + id + '/finish', p));

      case 'round:abandon':
        return _call(ApiClient.post('/api/v1/rounds/' + id + '/abandon', p));

      case 'round:reopen':
        return _call(ApiClient.post('/api/v1/rounds/' + id + '/reopen', {}));

      case 'round:delete':
        return _call(ApiClient.del('/api/v1/rounds/' + id));

      // ── HoleScore operations ──
      case 'hole_score:upsert_scores':
        // entity_id is roundId:hole:N — extract roundId
        var roundId = id.split(':hole:')[0];
        // payload: { holeNo, scores: [...] }
        return _call(ApiClient.request(
          '/api/v1/rounds/' + roundId + '/holes/' + p.holeNo + '/scores',
          { method: 'PUT', body: p.scores }
        ));

      default:
        console.warn('[PushEngine] unknown operation:', entry.entity_type + ':' + entry.operation);
        return { ok: false, status: 0, data: null };
    }
  }

  async function _call(responsePromise){
    try {
      var res = await responsePromise;
      var data = null;
      try { data = await res.json(); } catch(e){}
      return { ok: res.ok, status: res.status, data: data };
    } catch(e){
      // Network error
      return { ok: false, status: 0, data: null };
    }
  }

  // ── Core loop ─────────────────────────────────────────────

  async function _processNext(){
    if(_paused) return false;

    // Must be logged in
    if(typeof AuthState !== 'undefined' && !AuthState.isLoggedIn()){
      return false;
    }
    if(!ApiClient.hasTokens()){
      return false;
    }

    var entry = SyncQueue.peek();
    if(!entry) return false;

    // Skip if exceeded max retries
    if(entry.retry_count >= MAX_RETRIES){
      console.warn('[PushEngine] max retries exceeded, marking conflict:', entry.change_id);
      SyncQueue.markConflict(entry.change_id, 0, 'Max retries exceeded');
      return true; // continue to next
    }

    SyncQueue.markSyncing(entry.change_id);

    var result = await _dispatch(entry);

    if(result.ok){
      // Success — notify coordinator, remove from queue
      SyncQueue.markSynced(entry.change_id);
      _notifySuccess(entry, result);
      return true; // process next immediately
    }

    // Classify failure
    if(result.status === 0){
      // Network error — retry later
      SyncQueue.markFailed(entry.change_id, 0, 'Network error');
      return false; // stop processing, wait for retry
    }

    if(result.status === 401){
      // Auth expired — ApiClient already tried refresh
      // Put back to pending, stop processing
      SyncQueue.markFailed(entry.change_id, 401, 'Authentication failed');
      return false;
    }

    if(result.status === 409){
      // Conflict — version mismatch or invalid transition
      SyncQueue.markConflict(entry.change_id, 409,
        (result.data && result.data.error) || 'Conflict');
      _notifyConflict(entry, result);
      return true; // skip this, process next
    }

    if(result.status === 429){
      // Rate limited — backoff
      SyncQueue.markFailed(entry.change_id, 429, 'Rate limited');
      return false;
    }

    if(result.status >= 400 && result.status < 500){
      // Client error (400, 404, etc.) — likely permanent, mark conflict
      SyncQueue.markConflict(entry.change_id, result.status,
        (result.data && result.data.error) || 'Client error');
      return true; // skip, process next
    }

    // 5xx server error — retry
    SyncQueue.markFailed(entry.change_id, result.status,
      (result.data && result.data.error) || 'Server error');
    return false;
  }

  async function _tick(){
    if(_running || _paused) return;
    _running = true;

    try {
      // Process entries in a loop until none left or blocked
      var cont = true;
      while(cont){
        cont = await _processNext();
      }
    } catch(e){
      console.error('[PushEngine] tick error:', e);
    } finally {
      _running = false;
    }

    _scheduleNext();
  }

  function _scheduleNext(){
    if(_timer) clearTimeout(_timer);

    var pending = SyncQueue.pendingCount();
    if(pending > 0){
      _timer = setTimeout(_tick, ACTIVE_POLL_MS);
    } else {
      // Check for failed entries that need retry (with backoff)
      var failed = SyncQueue.getByStatus('failed');
      if(failed.length > 0){
        var delay = _backoffDelay(failed[0].retry_count);
        _timer = setTimeout(function(){
          SyncQueue.retryAllFailed();
          _tick();
        }, delay);
      } else {
        _timer = setTimeout(_tick, IDLE_POLL_MS);
      }
    }
  }

  function _backoffDelay(retryCount){
    var delay = BASE_DELAY * Math.pow(2, Math.min(retryCount, 5));
    return Math.min(delay, MAX_DELAY);
  }

  // ── Callbacks (set by SyncCoordinator) ────────────────────

  var _onSuccess  = null;
  var _onConflict = null;

  function _notifySuccess(entry, result){
    if(_onSuccess) _onSuccess(entry, result);
  }

  function _notifyConflict(entry, result){
    if(_onConflict) _onConflict(entry, result);
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Start the push engine. Call once at app init.
   */
  function start(){
    _paused = false;
    _tick();
  }

  /**
   * Stop the push engine.
   */
  function stop(){
    _paused = true;
    if(_timer){
      clearTimeout(_timer);
      _timer = null;
    }
  }

  /**
   * Nudge: trigger immediate processing (e.g., after enqueue).
   */
  function nudge(){
    if(_paused) return;
    if(_running) return; // already processing
    if(_timer) clearTimeout(_timer);
    _tick();
  }

  /**
   * Set callback for successful sync.
   * @param {function(entry, result)} fn
   */
  function onSuccess(fn){
    _onSuccess = fn;
  }

  /**
   * Set callback for conflict.
   * @param {function(entry, result)} fn
   */
  function onConflict(fn){
    _onConflict = fn;
  }

  /**
   * Check if engine is actively processing.
   * @returns {boolean}
   */
  function isRunning(){
    return _running;
  }

  return {
    start:     start,
    stop:      stop,
    nudge:     nudge,
    onSuccess: onSuccess,
    onConflict: onConflict,
    isRunning: isRunning
  };

})();

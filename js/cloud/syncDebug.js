// ============================================================
// syncDebug.js — Console debug tools for Sync v1
//
// Usage: open browser console and call SyncDebug.status(),
//        SyncDebug.queue(), SyncDebug.conflicts(), etc.
//
// Depends on: SyncCoordinator, SyncQueue, PushEngine, PullEngine,
//             ConflictResolver, RoundStore (all optional — graceful if missing)
// ============================================================

var SyncDebug = (function(){

  /**
   * Overall sync status snapshot.
   */
  function status(){
    if(typeof SyncCoordinator === 'undefined'){
      console.warn('[SyncDebug] SyncCoordinator not loaded');
      return null;
    }
    var s = SyncCoordinator.status();
    console.table([s]);
    return s;
  }

  /**
   * Show current SyncQueue contents grouped by status.
   */
  function queue(){
    if(typeof SyncQueue === 'undefined'){
      console.warn('[SyncDebug] SyncQueue not loaded');
      return null;
    }
    var all = SyncQueue.getAll();
    if(all.length === 0){
      console.log('[SyncDebug] Queue empty');
      return [];
    }
    var grouped = {};
    for(var i = 0; i < all.length; i++){
      var e = all[i];
      var st = e.status || 'unknown';
      if(!grouped[st]) grouped[st] = [];
      grouped[st].push({
        changeId:   e.change_id,
        type:       e.entity_type,
        id:         e.entity_id,
        op:         e.operation,
        retries:    e.retry_count,
        error:      e.last_error_message || '',
        created:    e.created_at
      });
    }
    for(var key in grouped){
      console.groupCollapsed('[SyncDebug] Queue — ' + key + ' (' + grouped[key].length + ')');
      console.table(grouped[key]);
      console.groupEnd();
    }
    return all;
  }

  /**
   * Show conflict log.
   * @param {number} [limit=20]
   */
  function conflicts(limit){
    if(typeof ConflictResolver === 'undefined'){
      console.warn('[SyncDebug] ConflictResolver not loaded');
      return null;
    }
    var logs = ConflictResolver.getLogs();
    var n = limit || 20;
    var recent = logs.slice(-n);
    if(recent.length === 0){
      console.log('[SyncDebug] No conflict logs');
      return [];
    }
    console.table(recent);
    return recent;
  }

  /**
   * Show sync metadata for all rounds.
   */
  function rounds(){
    if(typeof RoundStore === 'undefined'){
      console.warn('[SyncDebug] RoundStore not loaded');
      return null;
    }
    var all = RoundStore.list({ limit: 0 });
    var rows = [];
    for(var i = 0; i < all.length; i++){
      var s = all[i];
      var sync = s.sync || {};
      rows.push({
        id:            s.id,
        status:        s.status,
        syncStatus:    sync.syncStatus || 'local',
        localVer:      sync.localVersion || 0,
        serverVer:     sync.serverVersion || 0,
        lastSynced:    sync.lastSyncedAt || '-',
        dirtyMeta:     (s.dirtyFlags && s.dirtyFlags.meta) || false,
        dirtyScore:    (s.dirtyFlags && s.dirtyFlags.score) || false,
        dirtyHoles:    Object.keys(s.dirtyHoles || {}).join(',') || '-'
      });
    }
    console.table(rows);
    return rows;
  }

  /**
   * Show detailed sync info for a specific round.
   * @param {string} roundId
   */
  function round(roundId){
    if(typeof RoundStore === 'undefined'){
      console.warn('[SyncDebug] RoundStore not loaded');
      return null;
    }
    var s = RoundStore.getSummary(roundId);
    if(!s){
      console.warn('[SyncDebug] Round not found:', roundId);
      return null;
    }
    console.log('[SyncDebug] Round:', roundId);
    console.log('  status:', s.status, '| lockState:', s.lockState);
    console.log('  sync:', JSON.stringify(s.sync || {}, null, 2));
    console.log('  dirtyFlags:', JSON.stringify(s.dirtyFlags || {}, null, 2));
    console.log('  dirtyHoles:', JSON.stringify(s.dirtyHoles || {}, null, 2));

    // Show queue entries for this round
    if(typeof SyncQueue !== 'undefined'){
      var all = SyncQueue.getAll();
      var related = [];
      for(var i = 0; i < all.length; i++){
        if(all[i].entity_id === roundId || all[i].entity_id.indexOf(roundId + ':hole:') === 0){
          related.push(all[i]);
        }
      }
      if(related.length > 0){
        console.log('  queue entries (' + related.length + '):');
        console.table(related.map(function(e){
          return { op: e.operation, entity: e.entity_id, status: e.status, retries: e.retry_count };
        }));
      } else {
        console.log('  queue entries: none');
      }
    }
    return s;
  }

  /**
   * Retry all failed queue entries.
   */
  function retryFailed(){
    if(typeof SyncQueue === 'undefined'){
      console.warn('[SyncDebug] SyncQueue not loaded');
      return;
    }
    var count = SyncQueue.retryAllFailed();
    console.log('[SyncDebug] Retried', count, 'failed entries');
    if(typeof PushEngine !== 'undefined') PushEngine.nudge();
    return count;
  }

  /**
   * Force pull summaries now.
   */
  function forcePull(){
    if(typeof PullEngine === 'undefined'){
      console.warn('[SyncDebug] PullEngine not loaded');
      return;
    }
    console.log('[SyncDebug] Forcing pull summaries...');
    PullEngine.pullSummaries({ force: true });
  }

  /**
   * Force nudge PushEngine.
   */
  function nudge(){
    if(typeof PushEngine === 'undefined'){
      console.warn('[SyncDebug] PushEngine not loaded');
      return;
    }
    PushEngine.nudge();
    console.log('[SyncDebug] PushEngine nudged');
  }

  return {
    status:      status,
    queue:       queue,
    conflicts:   conflicts,
    rounds:      rounds,
    round:       round,
    retryFailed: retryFailed,
    forcePull:   forcePull,
    nudge:       nudge
  };

})();

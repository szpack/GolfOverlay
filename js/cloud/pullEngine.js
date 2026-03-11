// ============================================================
// pullEngine.js — Pull data from server to local
//
// Phase 2: minimal pull scenarios:
//   1. Login/startup → pull round summaries
//   2. Open round → pull detail + hole-scores
//
// Depends on: ApiClient, AuthState, RoundStore
// Loaded after: apiClient.js, authState.js, conflictResolver.js
// ============================================================

var PullEngine = (function(){

  var _pulling = false;
  var _lastSummaryPull = 0;
  var SUMMARY_PULL_COOLDOWN = 30000;  // 30s between summary pulls

  // ══════════════════════════════════════════
  // PULL ROUND SUMMARIES
  // ══════════════════════════════════════════

  /**
   * Pull round summaries from server. Merges into local RoundStore.
   * Called on login and can be called periodically.
   *
   * @param {Object} [opts]
   * @param {string} [opts.updatedAfter] - ISO timestamp, only pull rounds updated after this
   * @param {boolean} [opts.force] - bypass cooldown
   * @returns {Promise<{ok: boolean, count: number}>}
   */
  async function pullSummaries(opts){
    opts = opts || {};

    if(!_canPull()) return { ok: false, count: 0 };

    // Cooldown check
    if(!opts.force){
      var now = Date.now();
      if(now - _lastSummaryPull < SUMMARY_PULL_COOLDOWN){
        return { ok: true, count: 0 };
      }
    }

    _pulling = true;
    try {
      // Build query params
      var params = '?limit=100&include_deleted=true';
      if(opts.updatedAfter){
        params += '&updated_after=' + encodeURIComponent(opts.updatedAfter);
      }

      var res = await ApiClient.get('/api/v1/rounds' + params);
      if(!res.ok){
        console.warn('[PullEngine] pullSummaries failed:', res.status);
        return { ok: false, count: 0 };
      }

      var data = await ApiClient.json(res);
      var rounds = (data && data.rounds) || [];

      var merged = 0;
      for(var i = 0; i < rounds.length; i++){
        var changed = RoundStore.applyRemoteMerge(rounds[i]);
        if(changed) merged++;
      }

      _lastSummaryPull = Date.now();
      console.log('[PullEngine] pullSummaries: received', rounds.length, 'merged', merged);
      return { ok: true, count: merged };
    } catch(e){
      console.error('[PullEngine] pullSummaries error:', e);
      return { ok: false, count: 0 };
    } finally {
      _pulling = false;
    }
  }

  // ══════════════════════════════════════════
  // PULL ROUND DETAIL
  // ══════════════════════════════════════════

  /**
   * Pull full round detail + hole scores from server.
   * Called when user opens a round.
   *
   * @param {string} roundId
   * @returns {Promise<{ok: boolean, roundChanged: boolean, scoresChanged: boolean}>}
   */
  async function pullRoundDetail(roundId){
    if(!_canPull() || !roundId) return { ok: false, roundChanged: false, scoresChanged: false };

    _pulling = true;
    try {
      // Check if we should skip pull (round never synced)
      var summary = RoundStore.getSummary(roundId);
      if(summary && summary.sync && summary.sync.serverVersion === 0){
        // Never pushed to server — no point pulling
        return { ok: true, roundChanged: false, scoresChanged: false };
      }

      // Pull round detail and hole scores in parallel
      var roundRes = ApiClient.get('/api/v1/rounds/' + roundId);
      var scoresRes = ApiClient.get('/api/v1/rounds/' + roundId + '/hole-scores');

      var results = await Promise.all([roundRes, scoresRes]);
      var rRes = results[0];
      var sRes = results[1];

      var roundChanged = false;
      var scoresChanged = false;

      // Process round detail
      if(rRes.ok){
        var rData = await ApiClient.json(rRes);
        if(rData && rData.round){
          roundChanged = RoundStore.applyRemoteMerge(rData.round);
        }
      } else if(rRes.status === 404){
        // Round deleted on server — mark local as deleted if not already
        if(summary && !summary.deletedAt){
          RoundStore.putSummary(roundId, { deletedAt: new Date().toISOString() });
          roundChanged = true;
        }
      } else {
        console.warn('[PullEngine] pullRoundDetail round failed:', rRes.status);
      }

      // Process hole scores
      if(sRes.ok){
        var sData = await ApiClient.json(sRes);
        if(sData && sData.scores && sData.scores.length > 0){
          scoresChanged = RoundStore.applyRemoteScoreMerge(roundId, sData.scores);
        }
      } else if(sRes.status !== 404){
        console.warn('[PullEngine] pullRoundDetail scores failed:', sRes.status);
      }

      console.log('[PullEngine] pullRoundDetail:', roundId,
        'round:', roundChanged, 'scores:', scoresChanged);
      return { ok: true, roundChanged: roundChanged, scoresChanged: scoresChanged };
    } catch(e){
      console.error('[PullEngine] pullRoundDetail error:', e);
      return { ok: false, roundChanged: false, scoresChanged: false };
    } finally {
      _pulling = false;
    }
  }

  // ══════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════

  function _canPull(){
    if(typeof AuthState === 'undefined' || !AuthState.isLoggedIn()) return false;
    if(!ApiClient.hasTokens()) return false;
    return true;
  }

  function isPulling(){
    return _pulling;
  }

  return {
    pullSummaries:   pullSummaries,
    pullRoundDetail: pullRoundDetail,
    isPulling:       isPulling
  };

})();

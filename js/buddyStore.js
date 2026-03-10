// ============================================================
// buddyStore.js — Local Buddy CRUD + localStorage
// Offline-first buddy storage for BuddyPicker / BuddiesPage
// No dependencies — load after data.js
// ============================================================

const BuddyStore = (function(){

  const LS_KEY = 'golf_v5_buddies';

  var _buddies = {};  // { id: buddyObj }

  // ══════════════════════════════════════════
  // ID GENERATION
  // ══════════════════════════════════════════

  function _uid(){
    return 'buddy_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  // ══════════════════════════════════════════
  // DEFAULT FACTORY
  // ══════════════════════════════════════════

  function defaultBuddy(overrides){
    var now = new Date().toISOString();
    var b = {
      id: _uid(),
      displayName: '',
      nickname: '',
      handicap: null,
      notes: '',
      isFavorite: false,
      linkedUserId: null,
      linkedPlayerId: null,
      roundsTogetherCount: 0,
      lastPlayedAt: null,
      source: 'local',        // local | api | import
      createdAt: now,
      updatedAt: now
    };
    if(overrides){
      for(var k in overrides){
        if(overrides.hasOwnProperty(k)) b[k] = overrides[k];
      }
    }
    return b;
  }

  // ══════════════════════════════════════════
  // PERSISTENCE
  // ══════════════════════════════════════════

  function _persist(){
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(_buddies));
    } catch(e){
      console.warn('[BuddyStore] persist failed:', e);
    }
  }

  function _load(){
    try {
      var raw = localStorage.getItem(LS_KEY);
      if(!raw) { _buddies = {}; return; }
      _buddies = JSON.parse(raw) || {};
    } catch(e){
      console.warn('[BuddyStore] load failed:', e);
      _buddies = {};
    }
  }

  // ══════════════════════════════════════════
  // CRUD
  // ══════════════════════════════════════════

  /** List all buddies sorted by updatedAt desc */
  function list(){
    var arr = [];
    for(var id in _buddies){
      if(_buddies.hasOwnProperty(id)) arr.push(_buddies[id]);
    }
    arr.sort(function(a,b){
      // Favorites first, then by updatedAt desc
      if(a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return arr;
  }

  function get(id){
    return _buddies[id] || null;
  }

  function create(overrides){
    var buddy = defaultBuddy(overrides);
    _buddies[buddy.id] = buddy;
    _persist();
    return buddy;
  }

  function save(buddy){
    if(!buddy || !buddy.id) return null;
    buddy.updatedAt = new Date().toISOString();
    _buddies[buddy.id] = buddy;
    _persist();
    return buddy;
  }

  function remove(id){
    if(!_buddies[id]) return false;
    delete _buddies[id];
    _persist();
    return true;
  }

  // ══════════════════════════════════════════
  // SEARCH
  // ══════════════════════════════════════════

  function search(query){
    if(!query) return list();
    var q = query.toLowerCase();
    var arr = [];
    for(var id in _buddies){
      if(!_buddies.hasOwnProperty(id)) continue;
      var b = _buddies[id];
      var haystack = [b.displayName, b.nickname, b.notes].join(' ').toLowerCase();
      if(haystack.indexOf(q) >= 0) arr.push(b);
    }
    arr.sort(function(a,b){
      if(a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    return arr;
  }

  /** Find by displayName (case-insensitive) */
  function findByName(name){
    if(!name) return null;
    var n = name.toLowerCase();
    for(var id in _buddies){
      if(!_buddies.hasOwnProperty(id)) continue;
      var b = _buddies[id];
      if((b.displayName || '').toLowerCase() === n) return b;
      if((b.nickname || '').toLowerCase() === n) return b;
    }
    return null;
  }

  function toggleFavorite(id){
    var b = _buddies[id];
    if(!b) return null;
    b.isFavorite = !b.isFavorite;
    b.updatedAt = new Date().toISOString();
    _persist();
    return b;
  }

  /** Increment round count and update lastPlayedAt */
  function recordRound(id){
    var b = _buddies[id];
    if(!b) return null;
    b.roundsTogetherCount = (b.roundsTogetherCount || 0) + 1;
    b.lastPlayedAt = new Date().toISOString();
    b.updatedAt = new Date().toISOString();
    _persist();
    return b;
  }

  /** Merge API buddies into local store (upsert by linkedUserId or displayName) */
  function mergeFromApi(apiBuddies){
    if(!apiBuddies || !Array.isArray(apiBuddies)) return 0;
    var count = 0;
    var now = new Date().toISOString();
    for(var i = 0; i < apiBuddies.length; i++){
      var ab = apiBuddies[i];
      var existing = null;
      // Match by linkedUserId or buddy_player_id
      var linkedId = ab.linkedUserId || ab.buddy_player_id || null;
      if(linkedId){
        for(var id in _buddies){
          if(_buddies[id].linkedUserId === linkedId || _buddies[id].linkedPlayerId === linkedId){
            existing = _buddies[id]; break;
          }
        }
      }
      // Match by displayName
      if(!existing){
        var name = ab.displayName || ab.nickname || '';
        if(name) existing = findByName(name);
      }

      if(existing){
        // Update existing
        if(ab.handicap != null) existing.handicap = ab.handicap;
        if(ab.notes) existing.notes = ab.notes;
        if(ab.isFavorite != null) existing.isFavorite = ab.isFavorite;
        if(ab.roundsTogetherCount) existing.roundsTogetherCount = ab.roundsTogetherCount;
        if(ab.lastPlayedAt) existing.lastPlayedAt = ab.lastPlayedAt;
        existing.updatedAt = now;
      } else {
        // Create new
        var buddy = defaultBuddy({
          displayName: ab.displayName || ab.nickname || '',
          nickname: ab.nickname || '',
          handicap: ab.handicap || null,
          notes: ab.notes || '',
          isFavorite: ab.isFavorite || false,
          linkedUserId: ab.linkedUserId || null,
          linkedPlayerId: ab.buddy_player_id || null,
          roundsTogetherCount: ab.roundsTogetherCount || 0,
          lastPlayedAt: ab.lastPlayedAt || null,
          source: 'api',
          createdAt: now,
          updatedAt: now
        });
        _buddies[buddy.id] = buddy;
        count++;
      }
    }
    if(count > 0 || apiBuddies.length > 0) _persist();
    return count;
  }

  function count(){
    return Object.keys(_buddies).length;
  }

  // ══════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════

  _load();
  console.log('[BuddyStore] loaded', Object.keys(_buddies).length, 'buddies');

  return {
    list: list,
    get: get,
    create: create,
    save: save,
    remove: remove,
    search: search,
    findByName: findByName,
    toggleFavorite: toggleFavorite,
    recordRound: recordRound,
    mergeFromApi: mergeFromApi,
    count: count,
    defaultBuddy: defaultBuddy
  };

})();

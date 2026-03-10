// ============================================================
// buddyPicker.js — Player selection picker for New Round
// Full-screen overlay: self + recent + buddies + guest
// Depends on: NewRoundPage, NewRoundService, AuthState, ApiClient, T()
// ============================================================

const BuddyPicker = (function(){

  var _onDone = null;    // callback(result) on confirm
  var _bodyEl = null;    // picker body DOM element

  // ── Internal state ──
  var _selected = [];      // [{type, name, playerId, buddyId, sortOrder}]
  var _recentPlayers = [];  // [{name, playerId}]
  var _buddies = [];        // [{id, buddy_player_id, buddy_player, nickname, notes}]
  var _loading = false;
  var _searchQuery = '';
  var _composing = false;

  // ══════════════════════════════════════════
  // PUBLIC: show / confirm
  // ══════════════════════════════════════════

  function show(draft, onDone){
    _onDone = onDone;
    _searchQuery = '';
    _composing = false;
    _loading = false;
    _recentPlayers = [];
    _buddies = [];

    // Initialize selected from draft or default to self only
    _selected = [];
    if(draft.players && draft.players.length > 0){
      for(var i = 0; i < draft.players.length; i++){
        _selected.push(_clonePlayer(draft.players[i]));
      }
    } else {
      _selected.push(_buildSelf());
    }

    // Ensure self is at index 0
    if(_selected.length === 0 || _selected[0].type !== 'self'){
      // Remove any existing self entries
      _selected = _selected.filter(function(p){ return p.type !== 'self'; });
      _selected.unshift(_buildSelf());
    }

    _bodyEl = NewRoundPage.showPicker(T('nrSelectPlayers'), _confirm);
    NewRoundPage.setPickerBack(_handleBack);

    // Load data
    _loadData();

    // Initial render
    _render();
  }

  function _confirm(){
    if(_selected.length === 0) return;

    // Build final players array with sortOrder
    var players = [];
    for(var i = 0; i < _selected.length; i++){
      var p = _clonePlayer(_selected[i]);
      p.sortOrder = i;
      players.push(p);
    }

    _onDone({ players: players });
  }

  function _handleBack(){
    NewRoundPage.closePicker();
  }

  // ══════════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════════

  function _buildSelf(){
    var name = 'Me';
    var playerId = null;

    if(typeof AuthState !== 'undefined' && AuthState.isLoggedIn()){
      var player = AuthState.getPlayer();
      var user = AuthState.getUser();
      if(player){
        playerId = player.id || null;
        name = (player.user && player.user.displayName) || (user && user.displayName) || 'Me';
      } else if(user){
        name = user.displayName || 'Me';
      }
    }

    return { type: 'self', name: name, playerId: playerId, buddyId: null };
  }

  function _loadData(){
    // Recent players (sync)
    if(typeof NewRoundService !== 'undefined' && NewRoundService.getRecentPlayers){
      _recentPlayers = NewRoundService.getRecentPlayers(10) || [];
    }

    // Local buddies (sync, always available)
    var localBuddies = [];
    if(typeof BuddyStore !== 'undefined'){
      var all = BuddyStore.list();
      for(var i = 0; i < all.length; i++){
        var b = all[i];
        localBuddies.push({
          id: b.id,
          buddy_player_id: b.linkedPlayerId || null,
          buddy_player: null,
          nickname: b.nickname || b.displayName || '',
          displayName: b.displayName || '',
          notes: b.notes || ''
        });
      }
    }

    // API buddies (async) — merge with local on success
    _loading = true;
    _buddies = localBuddies;
    _render();

    if(typeof ApiClient !== 'undefined'){
      ApiClient.get('/api/v1/buddies').then(function(resp){
        if(!resp.ok){ _loading = false; _render(); return; }
        return resp.json();
      }).then(function(data){
        if(data && data.ok && Array.isArray(data.data)){
          _buddies = data.data;
          // Sync API results into local BuddyStore for offline use
          if(typeof BuddyStore !== 'undefined') BuddyStore.mergeFromApi(data.data);
        }
        _loading = false;
        _render();
      }).catch(function(){
        // API failed — keep local buddies already loaded
        _loading = false;
        _render();
      });
    } else {
      _loading = false;
      _render();
    }
  }

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════

  function _render(){
    if(!_bodyEl) return;
    _bodyEl.innerHTML = _renderContent();
    _wireEvents();
  }

  function _renderContent(){
    var html = '';

    // ── Selected Players Area ──
    html += '<div class="nr-selected-area">';
    html += '<div class="nr-section-title">' + T('nrSelectedLbl') + '</div>';
    html += '<div class="nr-selected-chips">';
    for(var i = 0; i < _selected.length; i++){
      var p = _selected[i];
      html += '<span class="nr-selected-chip">';
      html += _esc(p.name);
      if(p.type !== 'self'){
        html += ' <span class="nr-selected-remove" onclick="BuddyPicker.removeSelected(' + i + ')">&times;</span>';
      }
      html += '</span>';
    }
    html += '</div></div>';

    // ── Search Input ──
    html += '<input type="text" class="nr-search" id="bp-search" placeholder="' + T('nrSearchPlayersPh') + '" value="' + _esc(_searchQuery) + '">';

    // ── Build combined list (recent + buddies, deduplicated) ──
    var combined = _getCombinedList();

    // Filter by search
    if(_searchQuery){
      var q = _searchQuery.toLowerCase();
      combined = combined.filter(function(item){
        return item.name.toLowerCase().indexOf(q) !== -1;
      });
    }

    if(_loading){
      html += '<div class="nr-empty-hint">Loading…</div>';
    } else if(_searchQuery){
      // Show filtered results without section headers
      if(combined.length > 0){
        html += _renderPlayerSection('', combined);
      } else {
        html += '<div class="nr-empty-hint">' + T('nrNoPlayersFound') + '</div>';
      }
    } else {
      // Show sections: Recent, then Buddies
      var recentItems = [];
      var buddyItems = [];
      for(var i = 0; i < combined.length; i++){
        if(combined[i]._source === 'recent') recentItems.push(combined[i]);
        else buddyItems.push(combined[i]);
      }

      if(recentItems.length > 0){
        html += _renderPlayerSection(T('nrRecentCoPlayersLbl'), recentItems);
      }
      if(buddyItems.length > 0){
        html += _renderPlayerSection(T('nrMyBuddiesLbl'), buddyItems);
      }
      if(recentItems.length === 0 && buddyItems.length === 0){
        html += '<div class="nr-empty-hint">' + T('nrNoPlayersFound') + '</div>';
      }
    }

    // ── Add Guest button ──
    html += '<div class="nr-section">';
    html += '<button class="nr-add-guest-btn" onclick="BuddyPicker.addGuest()">+ ' + T('nrAddGuestBtn') + '</button>';
    html += '</div>';

    return html;
  }

  /** Normalize name for dedup comparison: lowercase + trim */
  function _normName(s){ return (s || '').trim().toLowerCase(); }

  function _getCombinedList(){
    var items = [];
    var seenPlayerIds = {};
    var seenBuddyIds = {};
    var seenNames = {};

    // Self — skip in lists
    if(_selected.length > 0 && _selected[0].type === 'self'){
      if(_selected[0].playerId) seenPlayerIds[_selected[0].playerId] = true;
      var sn = _normName(_selected[0].name);
      if(sn) seenNames[sn] = true;
    }

    // Buddies first (higher priority data)
    for(var i = 0; i < _buddies.length; i++){
      var b = _buddies[i];
      var pid = b.buddy_player_id || (b.buddy_player && b.buddy_player.id) || null;
      var bName = b.nickname
        || (b.buddy_player && b.buddy_player.user && b.buddy_player.user.displayName)
        || 'Buddy';

      // Dedup: playerId → buddyId → normalized name
      if(pid && seenPlayerIds[pid]) continue;
      if(b.id && seenBuddyIds[b.id]) continue;
      var nn = _normName(bName);
      if(!pid && !b.id && nn && seenNames[nn]) continue;

      if(pid) seenPlayerIds[pid] = true;
      if(b.id) seenBuddyIds[b.id] = true;
      if(nn) seenNames[nn] = true;

      items.push({
        _source: 'buddy',
        _id: 'buddy-' + b.id,
        name: bName,
        playerId: pid,
        buddyId: b.id
      });
    }

    // Recent players (deduplicate against buddies)
    for(var i = 0; i < _recentPlayers.length; i++){
      var r = _recentPlayers[i];
      if(r.playerId && seenPlayerIds[r.playerId]) continue;
      var rn = _normName(r.name);
      if(!r.playerId && rn && seenNames[rn]) continue;

      if(r.playerId) seenPlayerIds[r.playerId] = true;
      if(rn) seenNames[rn] = true;

      items.push({
        _source: 'recent',
        _id: 'recent-' + (r.playerId || i),
        name: r.name || 'Player',
        playerId: r.playerId || null,
        buddyId: null
      });
    }

    return items;
  }

  function _renderPlayerSection(title, items){
    var html = '<div class="nr-section">';
    if(title) html += '<div class="nr-section-title">' + _esc(title) + '</div>';
    html += '<div class="nr-player-list">';
    for(var i = 0; i < items.length; i++){
      html += _renderPlayerItem(items[i]);
    }
    html += '</div></div>';
    return html;
  }

  function _renderPlayerItem(item){
    var checked = _isSelected(item);
    var html = '<div class="nr-player-item' + (checked ? ' nr-selected' : '') + '" onclick="BuddyPicker.toggle(\'' + _esc(item._id) + '\')">';
    html += '<div class="nr-player-info">';
    html += '<div class="nr-player-name">' + _esc(item.name) + '</div>';
    html += '</div>';
    html += '<span class="nr-player-check">' + (checked ? '&#10003;' : '') + '</span>';
    html += '</div>';
    return html;
  }

  // ══════════════════════════════════════════
  // SELECTION LOGIC
  // ══════════════════════════════════════════

  function _isSelected(item){
    for(var i = 0; i < _selected.length; i++){
      var s = _selected[i];
      // Match by playerId if available
      if(item.playerId && s.playerId && item.playerId === s.playerId) return true;
      // Match by buddyId if available
      if(item.buddyId && s.buddyId && item.buddyId === s.buddyId) return true;
      // Match by _id for items without player/buddy IDs
      if(!item.playerId && !item.buddyId && s.name === item.name && s.type === 'member') return true;
    }
    return false;
  }

  function _findSelectedIndex(item){
    for(var i = 0; i < _selected.length; i++){
      var s = _selected[i];
      if(item.playerId && s.playerId && item.playerId === s.playerId) return i;
      if(item.buddyId && s.buddyId && item.buddyId === s.buddyId) return i;
      if(!item.playerId && !item.buddyId && s.name === item.name && s.type === 'member') return i;
    }
    return -1;
  }

  function toggle(itemId){
    // Find the item in combined list
    var combined = _getCombinedList();
    var item = null;
    for(var i = 0; i < combined.length; i++){
      if(combined[i]._id === itemId){ item = combined[i]; break; }
    }
    if(!item) return;

    var idx = _findSelectedIndex(item);
    if(idx >= 0){
      // Deselect (skip self at index 0)
      if(idx === 0) return;
      _selected.splice(idx, 1);
    } else {
      // Select
      _selected.push({
        type: 'member',
        name: item.name,
        playerId: item.playerId || null,
        buddyId: item.buddyId || null
      });
    }

    _render();
  }

  function addGuest(){
    var name = prompt(T('nrGuestNamePh'));
    if(!name || !name.trim()) return;
    name = name.trim();

    _selected.push({
      type: 'guest',
      name: name,
      playerId: null,
      buddyId: null
    });

    _render();
  }

  function removeSelected(index){
    // Protect self at index 0
    if(index <= 0) return;
    if(index >= _selected.length) return;
    _selected.splice(index, 1);
    _render();
  }

  // ══════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════

  function _clonePlayer(p){
    return {
      type: p.type || 'member',
      name: p.name || '',
      playerId: p.playerId || null,
      buddyId: p.buddyId || null,
      sortOrder: p.sortOrder || 0
    };
  }

  function _wireEvents(){
    var searchInput = document.getElementById('bp-search');
    if(!searchInput) return;

    searchInput.addEventListener('compositionstart', function(){ _composing = true; });
    searchInput.addEventListener('compositionend', function(){
      _composing = false;
      _searchQuery = this.value;
      var pos = this.selectionStart;
      _render();
      var restored = document.getElementById('bp-search');
      if(restored){ restored.focus(); restored.setSelectionRange(pos, pos); }
    });
    searchInput.addEventListener('input', function(){
      if(_composing) return;
      _searchQuery = this.value;
      var pos = this.selectionStart;
      _render();
      var restored = document.getElementById('bp-search');
      if(restored){ restored.focus(); restored.setSelectionRange(pos, pos); }
    });
  }

  function _esc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ══════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════

  return {
    show: show,
    toggle: toggle,
    addGuest: addGuest,
    removeSelected: removeSelected
  };

})();

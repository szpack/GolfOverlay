// ============================================================
// buddiesPage.js — Buddies (BuddyContact) list page
// Depends on: data.js, shell.js, ApiClient, T()
// ============================================================

const BuddiesPage = (function(){

  var _buddies = [];
  var _total = 0;
  var _loading = false;
  var _filter = { search: '', isFavorite: null, sortBy: null, sortDir: null };
  var _page = 0;
  var _pageSize = 20;

  // Modal state
  var _linkedUserId = null;
  var _linkedUserName = null;
  var _userSearchResults = [];
  var _userSearchTimer = null;

  // ── Helpers ──

  function _esc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function _fmtDate(d){
    if(!d) return '—';
    var dt = new Date(d);
    return dt.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
  }

  // ── Data fetch ──

  async function _fetch(){
    _loading = true;
    _renderBody();

    // Try API first
    var apiOk = false;
    if(typeof ApiClient !== 'undefined'){
      var params = new URLSearchParams();
      if(_filter.search) params.set('search', _filter.search);
      if(_filter.isFavorite !== null) params.set('isFavorite', _filter.isFavorite);
      if(_filter.sortBy) params.set('sortBy', _filter.sortBy);
      if(_filter.sortDir) params.set('sortDir', _filter.sortDir);
      params.set('limit', _pageSize);
      params.set('offset', _page * _pageSize);

      try {
        var res = await ApiClient.get('/api/v1/buddies?' + params.toString());
        if(res.ok){
          var data = await ApiClient.json(res);
          _buddies = (data && data.buddies) || [];
          _total = (data && data.total) || 0;
          apiOk = true;
          // Sync into local BuddyStore
          if(typeof BuddyStore !== 'undefined') BuddyStore.mergeFromApi(_buddies);
        }
      } catch(e){
        console.warn('[BuddiesPage] API unavailable, using local store');
      }
    }

    // Fallback to local BuddyStore
    if(!apiOk && typeof BuddyStore !== 'undefined'){
      var all = _filter.search ? BuddyStore.search(_filter.search) : BuddyStore.list();
      if(_filter.isFavorite === true){
        all = all.filter(function(b){ return b.isFavorite; });
      }
      _total = all.length;
      _buddies = all.slice(_page * _pageSize, (_page + 1) * _pageSize);
    }

    _loading = false;
    _renderBody();
  }

  // ── Render ──

  function render(){
    var el = document.getElementById('page-buddies-content');
    if(!el) return;
    if(!Shell.requireAuth('page-buddies-content')) return;

    el.innerHTML = '<div class="bd-page">'
      + '<div class="bd-header">'
      + '<h2 class="bd-title">' + T('buddiesTitle') + '</h2>'
      + '<button class="sh-btn-primary bd-add-btn" onclick="BuddiesPage.showAdd()">' + T('addBuddyBtn') + '</button>'
      + '</div>'
      + '<div class="bd-toolbar">'
      + '<input type="text" id="bd-search" class="bd-search-input" placeholder="' + T('searchByNamePh') + '" oninput="BuddiesPage.onSearch(this.value)">'
      + '<div class="bd-filters">'
      + '<button class="bd-filter-btn' + (_filter.isFavorite === true ? ' bd-filter-active' : '') + '" onclick="BuddiesPage.toggleFavFilter()">&#9733; ' + T('favoritesLbl') + '</button>'
      + '<select class="bd-sort-select" onchange="BuddiesPage.onSort(this.value)">'
      + '<option value=""' + (!_filter.sortBy ? ' selected' : '') + '>' + T('sortDefaultLbl') + '</option>'
      + '<option value="name"' + (_filter.sortBy === 'name' ? ' selected' : '') + '>' + T('sortNameLbl') + '</option>'
      + '<option value="lastPlayed"' + (_filter.sortBy === 'lastPlayed' ? ' selected' : '') + '>' + T('sortLastPlayedLbl') + '</option>'
      + '<option value="rounds"' + (_filter.sortBy === 'rounds' ? ' selected' : '') + '>' + T('sortRoundsLbl') + '</option>'
      + '</select>'
      + '</div>'
      + '</div>'
      + '<div id="bd-body"></div>'
      + '</div>';

    _fetch();
  }

  function _renderBody(){
    var el = document.getElementById('bd-body');
    if(!el) return;

    if(_loading){
      el.innerHTML = '<div class="bd-loading">' + T('loadingLbl') + '</div>';
      return;
    }

    if(_buddies.length === 0){
      el.innerHTML = '<div class="bd-empty">'
        + '<div class="bd-empty-icon">&#129309;</div>'
        + '<div class="bd-empty-text">' + (_filter.search || _filter.isFavorite ? T('noMatchingBuddies') : T('noBuddiesYet')) + '</div>'
        + '</div>';
      return;
    }

    var html = '<div class="bd-list">';
    for(var i = 0; i < _buddies.length; i++){
      html += _renderBuddyCard(_buddies[i]);
    }
    html += '</div>';

    // Pagination
    var totalPages = Math.ceil(_total / _pageSize);
    if(totalPages > 1){
      html += '<div class="bd-pagination">';
      html += '<span class="bd-page-info">' + (_page * _pageSize + 1) + '–' + Math.min((_page + 1) * _pageSize, _total) + ' ' + T('ofLbl') + ' ' + _total + '</span>';
      html += '<button class="bd-page-btn" onclick="BuddiesPage.prevPage()"' + (_page === 0 ? ' disabled' : '') + '>&laquo;</button>';
      html += '<button class="bd-page-btn" onclick="BuddiesPage.nextPage()"' + (_page >= totalPages - 1 ? ' disabled' : '') + '>&raquo;</button>';
      html += '</div>';
    }

    el.innerHTML = html;
  }

  function _renderBuddyCard(b){
    var hcp = b.handicap != null ? b.handicap.toFixed(1) : '—';
    var favCls = b.isFavorite ? ' bd-fav-active' : '';
    return '<div class="bd-card" data-id="' + b.id + '">'
      + '<div class="bd-card-main" onclick="BuddiesPage.showEdit(\'' + b.id + '\')">'
      + '<div class="bd-card-avatar">' + _esc((b.displayName || '?').charAt(0).toUpperCase()) + '</div>'
      + '<div class="bd-card-info">'
      + '<div class="bd-card-name">' + _esc(b.displayName) + (b.linkedUserId ? ' <span class="bd-linked-badge">&#128279;</span>' : '') + '</div>'
      + '<div class="bd-card-meta">'
      + '<span class="bd-meta-item">' + T('hcpLbl') + ' ' + hcp + '</span>'
      + '<span class="bd-meta-item">' + b.roundsTogetherCount + ' ' + T('roundsCountLbl') + '</span>'
      + (b.lastPlayedAt ? '<span class="bd-meta-item">' + T('lastPlayedLbl') + ' ' + _fmtDate(b.lastPlayedAt) + '</span>' : '')
      + '</div>'
      + (b.notes ? '<div class="bd-card-notes">' + _esc(b.notes) + '</div>' : '')
      + '</div>'
      + '</div>'
      + '<button class="bd-fav-btn' + favCls + '" onclick="BuddiesPage.toggleFav(\'' + b.id + '\')" title="Toggle favorite">&#9733;</button>'
      + '</div>';
  }

  // ── Actions ──

  var _searchTimer = null;
  function onSearch(val){
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(function(){
      _filter.search = val;
      _page = 0;
      _fetch();
    }, 300);
  }

  function toggleFavFilter(){
    _filter.isFavorite = _filter.isFavorite === true ? null : true;
    _page = 0;
    _fetch();
    var btn = document.querySelector('.bd-filter-btn');
    if(btn) btn.classList.toggle('bd-filter-active', _filter.isFavorite === true);
  }

  function onSort(val){
    _filter.sortBy = val || null;
    _page = 0;
    _fetch();
  }

  function prevPage(){ if(_page > 0){ _page--; _fetch(); } }
  function nextPage(){
    var totalPages = Math.ceil(_total / _pageSize);
    if(_page < totalPages - 1){ _page++; _fetch(); }
  }

  async function toggleFav(id){
    // Local store toggle
    if(typeof BuddyStore !== 'undefined') BuddyStore.toggleFavorite(id);

    // API toggle
    if(typeof ApiClient !== 'undefined'){
      try {
        var res = await ApiClient.post('/api/v1/buddies/' + id + '/toggle-favorite');
        if(!res.ok){ console.warn('[BuddiesPage] API toggleFav failed', res.status); }
      } catch(e){ console.warn('[BuddiesPage] API toggleFav unavailable', e); }
    }

    _fetch();
  }

  // ── Add / Edit Modal ──

  function showAdd(){
    _linkedUserId = null;
    _linkedUserName = null;
    _userSearchResults = [];
    _showModal(null);
  }

  function showEdit(id){
    var buddy = null;
    for(var i = 0; i < _buddies.length; i++){
      if(_buddies[i].id === id){ buddy = _buddies[i]; break; }
    }
    if(!buddy) return;
    _linkedUserId = buddy.linkedUserId || null;
    _linkedUserName = _linkedUserId ? buddy.displayName : null;
    _userSearchResults = [];
    _showModal(buddy);
  }

  function _showModal(buddy){
    var isEdit = !!buddy && !!buddy.id;
    var title = isEdit ? T('editBuddyTitle') : T('addBuddyTitle');

    var overlay = document.createElement('div');
    overlay.className = 'bd-modal-overlay';
    overlay.id = 'bd-modal-overlay';
    overlay.onclick = function(e){ if(e.target === overlay) _closeModal(); };

    var html = '<div class="bd-modal">'
      + '<div class="bd-modal-header">'
      + '<h3>' + title + '</h3>'
      + '<button class="bd-modal-close" onclick="BuddiesPage.closeModal()">&times;</button>'
      + '</div>'
      + '<div class="bd-modal-body">';

    if(!isEdit){
      // ── Add mode: Golf ID search ──
      html += '<div class="bd-golfid-search">';
      html += '<label class="bd-form-label">Golf ID</label>';
      html += '<div class="bd-search-row">';
      html += '<input type="text" id="bd-f-golfid" class="bd-form-input bd-golfid-input" placeholder="000000" maxlength="6" inputmode="numeric" pattern="[0-9]*">';
      html += '<button class="sh-btn-primary bd-search-btn" onclick="BuddiesPage.searchGolfId()">' + T('searchBtn') + '</button>';
      html += '</div>';
      html += '<div id="bd-golfid-result"></div>';
      html += '</div>';

      html += '<div class="bd-modal-divider">— ' + T('orLbl') + ' —</div>';

      // Manual add fallback
      html += '<label class="bd-form-label">' + T('nameLbl') + '<input type="text" id="bd-f-name" class="bd-form-input" maxlength="50"></label>';
      html += '<label class="bd-form-label">' + T('handicapLbl') + '<input type="number" id="bd-f-hcp" class="bd-form-input" step="0.1" min="-10" max="54"></label>';
      html += '<label class="bd-form-label">' + T('notesLbl') + '<textarea id="bd-f-notes" class="bd-form-textarea" rows="3" maxlength="500"></textarea></label>';
      html += '<div class="bd-modal-footer">';
      html += '<button class="sh-btn-primary" onclick="BuddiesPage.saveBuddy(\'\')">' + T('addLbl') + '</button>';
      html += '</div>';
    } else {
      // ── Edit mode ──
      if(_linkedUserId){
        html += '<div class="bd-linked-indicator">'
          + '<span>&#128279; ' + T('linkedUserLbl') + ': <strong>' + _esc(_linkedUserName || '') + '</strong></span>'
          + '</div>';
      }
      html += '<label class="bd-form-label">' + T('nameLbl') + '<input type="text" id="bd-f-name" class="bd-form-input" maxlength="50" value="' + _esc(buddy.displayName || '') + '"' + (_linkedUserId ? ' readonly' : '') + '></label>';
      html += '<label class="bd-form-label">' + T('handicapLbl') + '<input type="number" id="bd-f-hcp" class="bd-form-input" step="0.1" min="-10" max="54" value="' + (buddy.handicap != null ? buddy.handicap : '') + '"></label>';
      html += '<label class="bd-form-label">' + T('notesLbl') + '<textarea id="bd-f-notes" class="bd-form-textarea" rows="3" maxlength="500">' + _esc(buddy.notes || '') + '</textarea></label>';
      html += '<div class="bd-modal-footer">';
      html += '<button class="sh-btn-danger-sm" onclick="BuddiesPage.deleteBuddy(\'' + buddy.id + '\')">' + T('deleteLbl') + '</button>';
      html += '<button class="sh-btn-primary" onclick="BuddiesPage.saveBuddy(\'' + buddy.id + '\')">' + T('saveLbl') + '</button>';
      html += '</div>';
    }

    html += '</div></div>';

    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    setTimeout(function(){
      var inp = document.getElementById('bd-f-golfid') || document.getElementById('bd-f-name');
      if(inp) inp.focus();
    }, 100);
  }

  // ── Golf ID search + follow ──

  async function searchGolfId(){
    var inp = document.getElementById('bd-f-golfid');
    var el = document.getElementById('bd-golfid-result');
    if(!inp || !el) return;

    var golfId = (inp.value || '').trim();
    if(!/^\d{6}$/.test(golfId)){
      el.innerHTML = '<div class="bd-golfid-error">' + T('invalidGolfId') + '</div>';
      return;
    }

    el.innerHTML = '<div class="bd-golfid-loading">' + T('searchingLbl') + '</div>';

    try {
      var res = await ApiClient.post('/api/v1/users/resolve', { type: 'golf_id', value: golfId });
      var data = await ApiClient.json(res);
      if(!res.ok){
        var msg = (data && data.error === 'self_lookup') ? T('cannotAddSelf')
                : (data && data.error === 'user_not_found') ? T('userNotFound')
                : T('userNotFound');
        el.innerHTML = '<div class="bd-golfid-error">' + msg + '</div>';
        return;
      }
      var u = data.data;
      if(!u){
        el.innerHTML = '<div class="bd-golfid-error">' + T('userNotFound') + '</div>';
        return;
      }

      var html = '<div class="bd-golfid-found">';
      html += '<div class="bd-user-avatar-letter">' + _esc((u.displayName || '?').charAt(0).toUpperCase()) + '</div>';
      html += '<div class="bd-user-info"><span class="bd-user-name">' + _esc(u.displayName) + '</span>';
      html += '<span class="bd-user-id">Golf ID: ' + _esc(u.golfId || golfId) + '</span></div>';
      html += '<button class="sh-btn-primary bd-follow-btn" onclick="BuddiesPage.followByGolfId(\'' + _esc(golfId) + '\')">' + T('followBtn') + '</button>';
      html += '</div>';
      el.innerHTML = html;
    } catch(e){
      console.error('[BuddiesPage] searchGolfId error', e);
      el.innerHTML = '<div class="bd-golfid-error">' + T('networkError') + '</div>';
    }
  }

  async function followByGolfId(golfId){
    var el = document.getElementById('bd-golfid-result');
    try {
      var res = await ApiClient.post('/api/v1/buddies/add-by-id', { golfId: golfId });
      var data = await ApiClient.json(res);
      if(!res.ok){
        var msg = (data && data.error === 'already_buddy') ? T('alreadyBuddy')
                : (data && data.error === 'self_add') ? T('cannotAddSelf')
                : (data && data.message) || T('failedSaveBuddy');
        if(el) el.innerHTML = '<div class="bd-golfid-error">' + msg + '</div>';
        return;
      }
      _closeModal();
      _fetch();
    } catch(e){
      console.error('[BuddiesPage] followByGolfId error', e);
      if(el) el.innerHTML = '<div class="bd-golfid-error">' + T('networkError') + '</div>';
    }
  }

  // Legacy compat
  function onUserSearch(){}
  function selectUser(){}
  function clearLink(){}

  function closeModal(){
    _closeModal();
  }

  function _closeModal(){
    var overlay = document.getElementById('bd-modal-overlay');
    if(overlay) overlay.remove();
  }

  async function saveBuddy(id){
    var name = (document.getElementById('bd-f-name').value || '').trim();
    var hcpVal = document.getElementById('bd-f-hcp').value;
    var notes = (document.getElementById('bd-f-notes').value || '').trim();

    if(!name){
      alert(T('nameRequiredMsg'));
      return;
    }

    var body = { displayName: name, notes: notes || null };
    if(hcpVal !== ''){
      body.handicap = parseFloat(hcpVal);
    } else {
      body.handicap = null;
    }
    if(_linkedUserId){
      body.linkedUserId = _linkedUserId;
    }

    // Try API first
    var apiOk = false;
    if(typeof ApiClient !== 'undefined'){
      try {
        var res;
        if(id){
          res = await ApiClient.patch('/api/v1/buddies/' + id, body);
        } else {
          res = await ApiClient.post('/api/v1/buddies', body);
        }
        var data = await ApiClient.json(res);
        if(res.ok){
          apiOk = true;
        } else {
          console.warn('[BuddiesPage] API save failed:', (data && data.error));
        }
      } catch(e){
        console.warn('[BuddiesPage] API unavailable, saving locally');
      }
    }

    // Always save to local BuddyStore
    if(typeof BuddyStore !== 'undefined'){
      if(id){
        var existing = BuddyStore.get(id);
        if(existing){
          existing.displayName = name;
          existing.handicap = body.handicap;
          existing.notes = notes;
          if(_linkedUserId) existing.linkedUserId = _linkedUserId;
          BuddyStore.save(existing);
        }
      } else {
        BuddyStore.create({
          displayName: name,
          handicap: body.handicap,
          notes: notes,
          linkedUserId: _linkedUserId || null
        });
      }
    }

    _closeModal();
    _fetch();
  }

  async function deleteBuddy(id){
    if(!confirm(T('deleteBuddyConfirm'))) return;

    // Try API
    if(typeof ApiClient !== 'undefined'){
      try {
        var res = await ApiClient.del('/api/v1/buddies/' + id);
        if(!res.ok){
          var data = await ApiClient.json(res);
          console.warn('[BuddiesPage] API delete failed:', (data && data.error));
        }
      } catch(e){
        console.warn('[BuddiesPage] API unavailable for delete');
      }
    }

    // Always remove from local store
    if(typeof BuddyStore !== 'undefined') BuddyStore.remove(id);

    _closeModal();
    _fetch();
  }

  return {
    render: render,
    onSearch: onSearch,
    toggleFavFilter: toggleFavFilter,
    onSort: onSort,
    prevPage: prevPage,
    nextPage: nextPage,
    toggleFav: toggleFav,
    showAdd: showAdd,
    showEdit: showEdit,
    closeModal: closeModal,
    saveBuddy: saveBuddy,
    deleteBuddy: deleteBuddy,
    onUserSearch: onUserSearch,
    selectUser: selectUser,
    clearLink: clearLink,
    searchGolfId: searchGolfId,
    followByGolfId: followByGolfId
  };

})();

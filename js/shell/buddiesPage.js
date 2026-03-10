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
    if(typeof ApiClient === 'undefined') return;
    _loading = true;
    _renderBody();

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
      } else {
        _buddies = [];
        _total = 0;
      }
    } catch(e){
      console.error('[BuddiesPage] fetch error', e);
      _buddies = [];
      _total = 0;
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
    try {
      var res = await ApiClient.post('/api/v1/buddies/' + id + '/toggle-favorite');
      if(!res.ok){ console.error('[BuddiesPage] toggleFav failed', res.status); }
      _fetch();
    } catch(e){ console.error('[BuddiesPage] toggleFav', e); }
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
    var isEdit = !!buddy;
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

    // User search section (for linking to registered user)
    if(!isEdit || !_linkedUserId){
      html += '<div class="bd-user-search">';
      html += '<label class="bd-form-label">' + T('searchUserPh');
      html += '<input type="text" id="bd-f-user-search" class="bd-form-input" placeholder="' + T('searchUserPh') + '" oninput="BuddiesPage.onUserSearch(this.value)">';
      html += '</label>';
      html += '<div id="bd-user-results"></div>';
      html += '</div>';
      html += '<div class="bd-modal-divider">— or —</div>';
    }

    // Linked user indicator
    if(_linkedUserId){
      html += '<div class="bd-linked-indicator">'
        + '<span>&#128279; ' + T('linkedUserLbl') + ': <strong>' + _esc(_linkedUserName || _linkedUserId.substring(0,8)) + '</strong></span>'
        + '<button class="bd-clear-link" onclick="BuddiesPage.clearLink()">' + T('clearLinkBtn') + '</button>'
        + '</div>';
    }

    html += '<label class="bd-form-label">' + T('nameLbl') + '<input type="text" id="bd-f-name" class="bd-form-input" maxlength="50" value="' + _esc(buddy ? buddy.displayName : '') + '"' + (_linkedUserId ? ' readonly' : '') + '></label>';
    html += '<label class="bd-form-label">' + T('handicapLbl') + '<input type="number" id="bd-f-hcp" class="bd-form-input" step="0.1" min="-10" max="54" value="' + (buddy && buddy.handicap != null ? buddy.handicap : '') + '"></label>';
    html += '<label class="bd-form-label">' + T('notesLbl') + '<textarea id="bd-f-notes" class="bd-form-textarea" rows="3" maxlength="500">' + _esc(buddy ? buddy.notes || '' : '') + '</textarea></label>';
    html += '</div>';

    html += '<div class="bd-modal-footer">';
    if(isEdit){
      html += '<button class="sh-btn-danger-sm" onclick="BuddiesPage.deleteBuddy(\'' + buddy.id + '\')">' + T('deleteLbl') + '</button>';
    }
    html += '<button class="sh-btn-primary" onclick="BuddiesPage.saveBuddy(\'' + (buddy ? buddy.id : '') + '\')">' + (isEdit ? T('saveLbl') : T('addLbl')) + '</button>';
    html += '</div></div>';

    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    setTimeout(function(){
      var inp = _linkedUserId ? document.getElementById('bd-f-hcp') : document.getElementById('bd-f-user-search') || document.getElementById('bd-f-name');
      if(inp) inp.focus();
    }, 100);
  }

  // ── User search in modal ──

  function onUserSearch(val){
    clearTimeout(_userSearchTimer);
    val = (val || '').trim();
    if(val.length < 2){
      _userSearchResults = [];
      _renderUserResults();
      return;
    }
    _userSearchTimer = setTimeout(async function(){
      try {
        var res = await ApiClient.get('/api/v1/users/search?q=' + encodeURIComponent(val));
        if(res.ok){
          var data = await ApiClient.json(res);
          _userSearchResults = (data && data.users) || [];
        } else {
          _userSearchResults = [];
        }
      } catch(e){
        _userSearchResults = [];
      }
      _renderUserResults();
    }, 300);
  }

  function _renderUserResults(){
    var el = document.getElementById('bd-user-results');
    if(!el) return;
    if(_userSearchResults.length === 0){
      el.innerHTML = '';
      return;
    }
    var html = '<div class="bd-user-list">';
    for(var i = 0; i < _userSearchResults.length; i++){
      var u = _userSearchResults[i];
      var shortId = u.id.substring(0, 8);
      html += '<div class="bd-user-item" onclick="BuddiesPage.selectUser(' + i + ')">';
      if(u.avatarUrl){
        html += '<img class="bd-user-avatar" src="' + _esc(u.avatarUrl) + '" alt="">';
      } else {
        html += '<div class="bd-user-avatar-letter">' + _esc((u.displayName || '?').charAt(0).toUpperCase()) + '</div>';
      }
      html += '<div class="bd-user-info"><span class="bd-user-name">' + _esc(u.displayName) + '</span>';
      html += '<span class="bd-user-id">' + _esc(shortId) + '</span></div>';
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function selectUser(index){
    var u = _userSearchResults[index];
    if(!u) return;
    _linkedUserId = u.id;
    _linkedUserName = u.displayName;
    // Fill name field
    var nameInp = document.getElementById('bd-f-name');
    if(nameInp){
      nameInp.value = u.displayName;
      nameInp.readOnly = true;
    }
    // Update UI: hide search, show linked indicator
    _userSearchResults = [];
    // Re-render modal
    _closeModal();
    _showModal({ displayName: u.displayName, linkedUserId: u.id, handicap: null, notes: '', id: null });
  }

  function clearLink(){
    _linkedUserId = null;
    _linkedUserName = null;
    var nameInp = document.getElementById('bd-f-name');
    if(nameInp){ nameInp.readOnly = false; nameInp.value = ''; }
    // Re-render modal to show search again
    var currentName = '';
    _closeModal();
    _showModal(null);
  }

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

    try {
      var res;
      if(id){
        res = await ApiClient.patch('/api/v1/buddies/' + id, body);
      } else {
        res = await ApiClient.post('/api/v1/buddies', body);
      }
      var data = await ApiClient.json(res);
      if(!res.ok){
        alert((data && data.error) || T('failedSaveBuddy'));
        return;
      }
      _closeModal();
      _fetch();
    } catch(e){
      console.error('[BuddiesPage] save error', e);
      alert(T('failedSaveBuddy'));
    }
  }

  async function deleteBuddy(id){
    if(!confirm(T('deleteBuddyConfirm'))) return;
    try {
      var res = await ApiClient.del('/api/v1/buddies/' + id);
      if(!res.ok){
        var data = await ApiClient.json(res);
        alert((data && data.error) || T('failedDeleteBuddy'));
        return;
      }
      _closeModal();
      _fetch();
    } catch(e){
      console.error('[BuddiesPage] delete error', e);
      alert(T('failedDeleteBuddy'));
    }
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
    clearLink: clearLink
  };

})();

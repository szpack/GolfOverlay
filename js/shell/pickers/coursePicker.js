// ============================================================
// coursePicker.js — Course selection picker for New Round
// Full-screen overlay: search / nearby / recent / nine selection
// Depends on: ClubStore, NewRoundService, NewRoundPage, T()
// ============================================================

const CoursePicker = (function(){

  var NEARBY_RADIUS_KM = 20;

  var _onDone = null;    // callback(result) on confirm
  var _bodyEl = null;    // picker body DOM element

  // ── Internal state ──
  var _step = 'list';    // 'list' | 'nine'
  var _searchQuery = '';
  var _composing = false;
  var _userLoc = null;   // {lat, lng} or null
  var _locStatus = 'idle'; // 'idle' | 'requesting' | 'granted' | 'denied'

  // Selection state
  var _clubId = null;
  var _club = null;
  var _routeMode = null;        // 'dual-nine' | 'single-layout'
  var _selectedLayoutId = null;
  var _selectedLayoutName = '';
  var _frontNineId = null;
  var _frontNineName = '';
  var _backNineId = null;
  var _backNineName = '';

  // ══════════════════════════════════════════
  // PUBLIC: show / confirm
  // ══════════════════════════════════════════

  function show(draft, onDone){
    _onDone = onDone;
    _step = 'list';
    _searchQuery = '';
    _composing = false;
    _clubId = null;
    _club = null;
    _routeMode = null;
    _selectedLayoutId = null;
    _selectedLayoutName = '';
    _frontNineId = null;
    _frontNineName = '';
    _backNineId = null;
    _backNineName = '';

    // Pre-fill from draft if returning to picker
    if(draft.clubId){
      _clubId = draft.clubId;
      _club = ClubStore.get(draft.clubId);
      _routeMode = draft.routeMode;
      _selectedLayoutId = draft.selectedLayoutId;
      _selectedLayoutName = draft.selectedLayoutName || '';
      _frontNineId = draft.frontNineId;
      _frontNineName = draft.frontNineName || '';
      _backNineId = draft.backNineId;
      _backNineName = draft.backNineName || '';
      if(_club) _step = 'nine';
    }

    _bodyEl = NewRoundPage.showPicker(T('nrSelectCourse'), _confirm);
    NewRoundPage.setPickerBack(_handleBack);

    // Request geolocation
    _requestLocation();

    // Render
    _render();
  }

  function _confirm(){
    if(!_clubId || !_club) return;

    // Validate based on routeMode
    if(_routeMode === 'dual-nine'){
      if(!_frontNineId || !_backNineId) return;
    } else if(_routeMode === 'single-layout'){
      if(!_selectedLayoutId) return;
    } else {
      return; // no route mode determined
    }

    _onDone({
      clubId: _clubId,
      clubName: _club.name || _club.name_en || '',
      routeMode: _routeMode,
      selectedLayoutId: _selectedLayoutId,
      selectedLayoutName: _selectedLayoutName,
      frontNineId: _frontNineId,
      frontNineName: _frontNineName,
      backNineId: _backNineId,
      backNineName: _backNineName,
      courseSummary: _buildSummary()
    });
  }

  function _handleBack(){
    if(_step === 'nine'){
      _step = 'list';
      NewRoundPage.setPickerTitle(T('nrSelectCourse'));
      _render();
    } else {
      NewRoundPage.closePicker();
    }
  }

  // ══════════════════════════════════════════
  // GEOLOCATION
  // ══════════════════════════════════════════

  function _requestLocation(){
    if(_locStatus !== 'idle') return;
    if(!navigator.geolocation) { _locStatus = 'denied'; return; }

    _locStatus = 'requesting';
    navigator.geolocation.getCurrentPosition(
      function(pos){
        _userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        _locStatus = 'granted';
        if(_step === 'list') _render();
      },
      function(){
        _locStatus = 'denied';
        _userLoc = null;
      },
      { timeout: 5000, maximumAge: 300000 }
    );
  }

  function _haversine(lat1, lng1, lat2, lng2){
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _clubDistance(club){
    if(!_userLoc || !club.geo || !club.geo.lat || !club.geo.lng) return null;
    return _haversine(_userLoc.lat, _userLoc.lng, club.geo.lat, club.geo.lng);
  }

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════

  function _render(){
    if(!_bodyEl) return;
    if(_step === 'list'){
      _bodyEl.innerHTML = _renderClubList();
    } else {
      _bodyEl.innerHTML = _renderNineSelect();
    }
    _wireEvents();
  }

  // ── Step 1: Club List ──

  function _renderClubList(){
    var html = '';

    // Search
    html += '<input type="text" class="nr-search" id="cp-search" placeholder="' + T('nrSearchClubsPh') + '" value="' + _esc(_searchQuery) + '">';

    if(_searchQuery){
      // Search results only
      var results = ClubStore.search(_searchQuery);
      html += _renderSection('', results);
      if(results.length === 0){
        html += '<div class="nr-empty-hint">' + T('nrNoClubsFound') + '</div>';
      }
    } else {
      // Priority: nearby > recent (use search for others)
      var seenIds = {};
      var nearby = _getNearbyClubs(seenIds);
      var recent = _getRecentClubs(seenIds);

      if(nearby.length > 0){
        html += _renderSection(T('nrNearbyLbl'), nearby);
      }
      if(recent.length > 0){
        html += _renderSection(T('nrRecentLbl'), recent);
      }
      if(nearby.length === 0 && recent.length === 0){
        html += '<div class="nr-empty-hint">' + T('nrSearchToFind') + '</div>';
      }
    }

    return html;
  }

  function _getNearbyClubs(seenIds){
    if(!_userLoc) return [];
    var clubs = ClubStore.listActive();
    var withDist = [];
    for(var i = 0; i < clubs.length; i++){
      var d = _clubDistance(clubs[i]);
      if(d !== null && d < NEARBY_RADIUS_KM){
        withDist.push({ club: clubs[i], dist: d });
      }
    }
    withDist.sort(function(a, b){ return a.dist - b.dist; });
    var result = [];
    for(var i = 0; i < Math.min(withDist.length, 5); i++){
      var c = withDist[i].club;
      if(!seenIds[c.id]){
        seenIds[c.id] = true;
        c._dist = withDist[i].dist;
        result.push(c);
      }
    }
    return result;
  }

  function _getRecentClubs(seenIds){
    var recent = NewRoundService.getRecentClubs(5);
    var result = [];
    for(var i = 0; i < recent.length; i++){
      if(!seenIds[recent[i].id]){
        seenIds[recent[i].id] = true;
        // Attach routing info if available
        if(typeof NewRoundService.getRecentClubRouting === 'function'){
          var ri = NewRoundService.getRecentClubRouting(recent[i].id);
          if(ri) recent[i]._recentRouting = ri;
        }
        result.push(recent[i]);
      }
    }
    return result;
  }

  function _renderSection(title, clubs){
    var html = '<div class="nr-section">';
    if(title) html += '<div class="nr-section-title">' + _esc(title) + '</div>';
    html += '<div class="nr-club-list">';
    for(var i = 0; i < clubs.length; i++){
      html += _renderClubItem(clubs[i]);
    }
    html += '</div></div>';
    return html;
  }

  function _renderClubItem(club){
    var selected = (_clubId === club.id);
    var holes = ClubStore.totalHoles(club);
    var nineCount = (club.nines || []).length;
    var nineNames = (club.nines || []).map(function(n){ return n.name || n.display_name || '?'; }).join(' / ');

    var meta = '';
    if(club.city) meta += club.city;

    // Distance (only if real geolocation data)
    var dist = club._dist != null ? club._dist : _clubDistance(club);
    if(dist !== null){
      if(meta) meta += ' · ';
      meta += dist < 1 ? (Math.round(dist * 1000) + 'm') : (dist.toFixed(1) + 'km');
    }

    if(holes){
      if(meta) meta += ' · ';
      meta += holes + 'H';
    }
    if(nineCount > 1 && nineNames){
      meta += '：' + nineNames;
    }

    // Recent routing info (e.g. "A+B")
    var recentRoute = '';
    if(club._recentRouting && club._recentRouting.routeSummary){
      recentRoute = club._recentRouting.routeSummary;
    }

    var html = '<div class="nr-club-item' + (selected ? ' nr-selected' : '') + '" onclick="CoursePicker.selectClub(\'' + club.id + '\')">';
    html += '<div class="nr-club-info">';
    html += '<div class="nr-club-name">' + _esc(club.name || club.name_en || 'Untitled') + '</div>';
    if(recentRoute){
      html += '<div class="nr-club-meta">' + _esc(meta + (meta ? ' · ' : '') + recentRoute) + '</div>';
    } else if(meta){
      html += '<div class="nr-club-meta">' + _esc(meta) + '</div>';
    }
    html += '</div>';
    if(selected) html += '<span class="nr-check">&#10003;</span>';
    html += '</div>';
    return html;
  }

  // ── Step 2: Nine / Layout Selection ──

  function _renderNineSelect(){
    if(!_club) return '';
    var html = '';

    // Club name header
    html += '<div class="nr-section">';
    html += '<div class="nr-section-title">' + _esc(_club.name || _club.name_en || '') + '</div>';
    html += '</div>';

    var nines = _getValidNines(_club);
    var layouts = _club.layouts || [];

    if(nines.length >= 2){
      // dual-nine mode
      html += _renderDualNineSelector(nines);
    } else if(nines.length === 1){
      // Single nine — show as selected, single-layout mode
      html += _renderSingleNine(nines[0], layouts);
    } else if(layouts.length > 0){
      // No nines but has layouts — show layout list
      html += _renderLayoutList(layouts);
    } else {
      html += '<div class="nr-empty-hint">' + T('nrNoLayouts') + '</div>';
    }

    // Current selection summary
    var summary = _buildSummary();
    if(summary){
      html += '<div class="nr-nine-result">';
      html += '<span>' + T('nrCurrentSelection') + '：' + _esc(summary) + '</span>';
      html += '</div>';
    }

    return html;
  }

  function _renderDualNineSelector(nines){
    var html = '<div class="nr-nine-selector">';

    // Front 9
    html += '<div class="nr-nine-group">';
    html += '<div class="nr-nine-label">' + T('nrFront9Lbl') + '</div>';
    html += '<div class="nr-nine-options">';
    for(var i = 0; i < nines.length; i++){
      var n = nines[i];
      var sel = (_frontNineId === n.id);
      html += '<button class="nr-nine-btn' + (sel ? ' nr-selected' : '') + '" onclick="CoursePicker.selectFront(\'' + n.id + '\')">';
      html += _esc(n.name || n.display_name || 'Nine ' + (i + 1));
      html += ' <span class="nr-nine-holes">' + (n.holes || []).length + 'H</span>';
      html += '</button>';
    }
    html += '</div></div>';

    // Back 9
    html += '<div class="nr-nine-group">';
    html += '<div class="nr-nine-label">' + T('nrBack9Lbl') + '</div>';
    html += '<div class="nr-nine-options">';
    for(var i = 0; i < nines.length; i++){
      var n = nines[i];
      var sel = (_backNineId === n.id);
      html += '<button class="nr-nine-btn' + (sel ? ' nr-selected' : '') + '" onclick="CoursePicker.selectBack(\'' + n.id + '\')">';
      html += _esc(n.name || n.display_name || 'Nine ' + (i + 1));
      html += ' <span class="nr-nine-holes">' + (n.holes || []).length + 'H</span>';
      html += '</button>';
    }
    html += '</div></div>';

    html += '</div>';
    return html;
  }

  function _renderSingleNine(nine, layouts){
    var html = '<div class="nr-section">';
    html += '<div class="nr-nine-label">' + _esc(nine.name || nine.display_name || 'Nine') + ' · ' + (nine.holes || []).length + 'H</div>';

    // Find layout that uses this single nine
    var layout = null;
    for(var i = 0; i < layouts.length; i++){
      var segs = layouts[i].segments || [];
      if(segs.length === 1 && segs[0].nine_id === nine.id){
        layout = layouts[i]; break;
      }
    }

    if(layout){
      html += '<div class="nr-nine-result">' + T('nrCurrentSelection') + '：' + _esc(layout.name || nine.name) + '</div>';
    } else if(layouts.length > 0){
      // Show all available layouts
      html += _renderLayoutList(layouts);
    }

    html += '</div>';
    return html;
  }

  function _renderLayoutList(layouts){
    var html = '<div class="nr-section">';
    html += '<div class="nr-nine-label">' + T('nrRoutingLbl') + '</div>';
    html += '<div class="nr-nine-options">';
    for(var i = 0; i < layouts.length; i++){
      var lay = layouts[i];
      var sel = (_selectedLayoutId === lay.id);
      html += '<button class="nr-nine-btn' + (sel ? ' nr-selected' : '') + '" onclick="CoursePicker.selectLayout(\'' + lay.id + '\')">';
      html += _esc(lay.name || 'Layout ' + (i + 1));
      html += ' <span class="nr-nine-holes">' + (lay.hole_count || '?') + 'H</span>';
      html += '</button>';
    }
    html += '</div></div>';
    return html;
  }

  // ══════════════════════════════════════════
  // ACTIONS
  // ══════════════════════════════════════════

  function selectClub(clubId){
    var club = ClubStore.get(clubId);
    if(!club) return;

    _clubId = clubId;
    _club = club;
    _selectedLayoutId = null;
    _selectedLayoutName = '';
    _frontNineId = null;
    _frontNineName = '';
    _backNineId = null;
    _backNineName = '';

    var nines = _getValidNines(club);

    if(nines.length >= 2){
      _routeMode = 'dual-nine';
      // Auto-select if exactly 2 nines
      if(nines.length === 2){
        _frontNineId = nines[0].id;
        _frontNineName = nines[0].name || nines[0].display_name || '';
        _backNineId = nines[1].id;
        _backNineName = nines[1].name || nines[1].display_name || '';
      }
    } else if(nines.length === 1){
      // Find matching single-nine layouts
      _routeMode = 'single-layout';
      var layouts = club.layouts || [];
      var singleNineLayouts = [];
      for(var i = 0; i < layouts.length; i++){
        var segs = layouts[i].segments || [];
        if(segs.length === 1 && segs[0].nine_id === nines[0].id){
          singleNineLayouts.push(layouts[i]);
        }
      }
      // Auto-select only when exactly 1 matching layout
      if(singleNineLayouts.length === 1){
        _selectedLayoutId = singleNineLayouts[0].id;
        _selectedLayoutName = singleNineLayouts[0].name || '';
      } else if(singleNineLayouts.length === 0 && layouts.length === 1){
        // No single-nine layout but only 1 layout total — auto-select it
        _selectedLayoutId = layouts[0].id;
        _selectedLayoutName = layouts[0].name || '';
      }
      // Otherwise: multiple layouts available — leave unselected, show list for user
    } else {
      // No nines, use layouts directly
      _routeMode = 'single-layout';
      var layouts = club.layouts || [];
      if(layouts.length === 1){
        _selectedLayoutId = layouts[0].id;
        _selectedLayoutName = layouts[0].name || '';
      }
    }

    _step = 'nine';
    NewRoundPage.setPickerTitle(_esc(club.name || club.name_en || ''));
    _render();
  }

  function selectFront(nineId){
    var nine = _findNine(nineId);
    if(!nine) return;
    _frontNineId = nineId;
    _frontNineName = nine.name || nine.display_name || '';
    _routeMode = 'dual-nine';
    _render();
  }

  function selectBack(nineId){
    var nine = _findNine(nineId);
    if(!nine) return;
    _backNineId = nineId;
    _backNineName = nine.name || nine.display_name || '';
    _routeMode = 'dual-nine';
    _render();
  }

  function selectLayout(layoutId){
    if(!_club) return;
    var layouts = _club.layouts || [];
    for(var i = 0; i < layouts.length; i++){
      if(layouts[i].id === layoutId){
        _selectedLayoutId = layoutId;
        _selectedLayoutName = layouts[i].name || '';
        _routeMode = 'single-layout';
        _render();
        return;
      }
    }
  }

  // ══════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════

  function _getValidNines(club){
    return (club.nines || []).filter(function(n){ return n.holes && n.holes.length > 0; });
  }

  function _findNine(nineId){
    if(!_club) return null;
    var nines = _club.nines || [];
    for(var i = 0; i < nines.length; i++){
      if(nines[i].id === nineId) return nines[i];
    }
    return null;
  }

  /**
   * Build a course summary string from explicit parameters.
   * Reusable outside of picker internal state.
   * @param {string} clubName
   * @param {string} routeMode - 'dual-nine' | 'single-layout'
   * @param {string} frontNineName
   * @param {string} backNineName
   * @param {string} layoutName
   * @returns {string}
   */
  function buildCourseSummary(clubName, routeMode, frontNineName, backNineName, layoutName){
    var name = clubName || '';
    if(routeMode === 'dual-nine' && frontNineName && backNineName){
      return name + ' · ' + frontNineName + ' + ' + backNineName;
    } else if(routeMode === 'single-layout' && layoutName){
      return name + ' · ' + layoutName;
    }
    return name;
  }

  function _buildSummary(){
    if(!_club) return '';
    return buildCourseSummary(
      _club.name || _club.name_en || '',
      _routeMode,
      _frontNineName,
      _backNineName,
      _selectedLayoutName
    );
  }

  function _wireEvents(){
    var searchInput = document.getElementById('cp-search');
    if(!searchInput) return;

    searchInput.addEventListener('compositionstart', function(){ _composing = true; });
    searchInput.addEventListener('compositionend', function(){
      _composing = false;
      _searchQuery = this.value;
      var pos = this.selectionStart;
      _render();
      var restored = document.getElementById('cp-search');
      if(restored){ restored.focus(); restored.setSelectionRange(pos, pos); }
    });
    searchInput.addEventListener('input', function(){
      if(_composing) return;
      _searchQuery = this.value;
      var pos = this.selectionStart;
      _render();
      var restored = document.getElementById('cp-search');
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
    selectClub: selectClub,
    selectFront: selectFront,
    selectBack: selectBack,
    selectLayout: selectLayout,
    buildCourseSummary: buildCourseSummary
  };

})();

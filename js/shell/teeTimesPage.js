// ============================================================
// teeTimesPage.js — TeeTimes Page (GolfHub)
// Page: Header + Intent Bar + Results Area
// Intent Bar: Where / When / Players / Access
// ============================================================

const TeeTimesPage = (function(){

  // ══════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════

  var _state = {
    where: null,        // { type: 'city'|'course', value: string, label: string }
    when: null,         // { type: 'today'|'tomorrow'|'weekend'|'date', date: Date, label: string }
    players: 2,         // 1-4
    access: 'all'       // 'all' | 'public' | 'member'
  };

  var _ui = {
    showWhereDropdown: false,
    showWhenDropdown: false,
    showPlayersDropdown: false,
    showAccessDropdown: false
  };

  // Mock data for cities and courses
  var _mockLocations = [
    { type: 'city', value: 'los-angeles', label: 'Los Angeles, CA' },
    { type: 'city', value: 'san-diego', label: 'San Diego, CA' },
    { type: 'city', value: 'san-francisco', label: 'San Francisco, CA' },
    { type: 'city', value: 'las-vegas', label: 'Las Vegas, NV' },
    { type: 'city', value: 'phoenix', label: 'Phoenix, AZ' },
    { type: 'course', value: 'course-1', label: 'Torrey Pines North', city: 'San Diego' },
    { type: 'course', value: 'course-2', label: 'Torrey Pines South', city: 'San Diego' },
    { type: 'course', value: 'course-3', label: 'Pebble Beach Golf Links', city: 'Pebble Beach' },
    { type: 'course', value: 'course-4', label: 'Spyglass Hill', city: 'Del Monte Forest' },
    { type: 'course', value: 'course-5', label: 'TPC Sawgrass', city: 'Ponte Vedra Beach' }
  ];

  // ══════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════

  function init(){
    // Set default "when" to today
    var today = new Date();
    _state.when = {
      type: 'today',
      date: today,
      label: formatDateLabel(today, 'today')
    };
  }

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════

  function render(){
    var el = document.getElementById('page-teetimes-content');
    if(!el) return;

    // Check auth (optional - TeeTimes can be browsed without login)
    // if(!Shell.requireAuth('page-teetimes-content')) return;

    var html = '';

    // ── Page Header ──
    html += '<div class="tt-page-header">';
    html += '<h1 class="tt-page-title">' + T('teetimesTitle', 'Find Tee Times') + '</h1>';
    html += '</div>';

    // ── Intent Bar ──
    html += _renderIntentBar();

    // ── Results Area (Placeholder) ──
    html += _renderResultsArea();

    el.innerHTML = html;

    // Wire up document click to close dropdowns
    _wireDocumentClick();
  }

  // ══════════════════════════════════════════
  // INTENT BAR
  // ══════════════════════════════════════════

  function _renderIntentBar(){
    var html = '<div class="tt-intent-bar">';

    // Where field
    html += _renderWhereField();

    // When field
    html += _renderWhenField();

    // Players field
    html += _renderPlayersField();

    // Access field
    html += _renderAccessField();

    // Search button
    html += '<button class="tt-search-btn" onclick="TeeTimesPage.search()">';
    html += '<span class="tt-search-icon">&#128269;</span>';
    html += '<span class="tt-search-label">' + T('searchBtn', 'Search') + '</span>';
    html += '</button>';

    html += '</div>';
    return html;
  }

  // ── Where Field ──
  function _renderWhereField(){
    var label = _state.where ? _state.where.label : T('wherePh', 'Where?');
    var hasValue = !!_state.where;
    var activeClass = _ui.showWhereDropdown ? ' tt-field-active' : '';
    var filledClass = hasValue ? ' tt-field-filled' : '';

    var html = '<div class="tt-intent-field' + activeClass + filledClass + '" id="tt-field-where">';
    html += '<div class="tt-field-inner" onclick="TeeTimesPage.toggleWhere()">';
    html += '<div class="tt-field-label">' + T('whereLabel', 'Where') + '</div>';
    html += '<div class="tt-field-value">' + label + '</div>';
    html += '<div class="tt-field-arrow">&#9662;</div>';
    html += '</div>';

    // Dropdown
    if(_ui.showWhereDropdown){
      html += '<div class="tt-dropdown">';
      html += '<div class="tt-dropdown-section">';
      html += '<div class="tt-dropdown-title">' + T('citiesLabel', 'Cities') + '</div>';
      _mockLocations.filter(function(l){ return l.type === 'city'; }).forEach(function(loc){
        var selected = _state.where && _state.where.value === loc.value ? ' tt-dropdown-item-selected' : '';
        html += '<div class="tt-dropdown-item' + selected + '" onclick="TeeTimesPage.selectWhere(' + JSON.stringify(loc).replace(/"/g, '&quot;') + ')">';
        html += '<span class="tt-dropdown-icon">&#127969;</span>';
        html += '<span class="tt-dropdown-text">' + loc.label + '</span>';
        html += '</div>';
      });
      html += '</div>';
      html += '<div class="tt-dropdown-section">';
      html += '<div class="tt-dropdown-title">' + T('coursesLabel', 'Courses') + '</div>';
      _mockLocations.filter(function(l){ return l.type === 'course'; }).forEach(function(loc){
        var selected = _state.where && _state.where.value === loc.value ? ' tt-dropdown-item-selected' : '';
        html += '<div class="tt-dropdown-item' + selected + '" onclick="TeeTimesPage.selectWhere(' + JSON.stringify(loc).replace(/"/g, '&quot;') + ')">';
        html += '<span class="tt-dropdown-icon">&#9971;</span>';
        html += '<span class="tt-dropdown-text">' + loc.label + '</span>';
        html += '<span class="tt-dropdown-meta">' + loc.city + '</span>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ── When Field ──
  function _renderWhenField(){
    var label = _state.when ? _state.when.label : T('whenPh', 'When?');
    var hasValue = !!_state.when;
    var activeClass = _ui.showWhenDropdown ? ' tt-field-active' : '';
    var filledClass = hasValue ? ' tt-field-filled' : '';

    var html = '<div class="tt-intent-field' + activeClass + filledClass + '" id="tt-field-when">';
    html += '<div class="tt-field-inner" onclick="TeeTimesPage.toggleWhen()">';
    html += '<div class="tt-field-label">' + T('whenLabel', 'When') + '</div>';
    html += '<div class="tt-field-value">' + label + '</div>';
    html += '<div class="tt-field-arrow">&#9662;</div>';
    html += '</div>';

    // Dropdown
    if(_ui.showWhenDropdown){
      html += '<div class="tt-dropdown tt-dropdown-wide">';

      // Quick options
      html += '<div class="tt-dropdown-section">';
      html += '<div class="tt-dropdown-title">' + T('quickDatesLabel', 'Quick Select') + '</div>';

      var quickOptions = [
        { type: 'today', label: T('todayLabel', 'Today') },
        { type: 'tomorrow', label: T('tomorrowLabel', 'Tomorrow') },
        { type: 'weekend', label: T('thisWeekendLabel', 'This Weekend') }
      ];

      quickOptions.forEach(function(opt){
        var selected = _state.when && _state.when.type === opt.type ? ' tt-dropdown-item-selected' : '';
        html += '<div class="tt-dropdown-item' + selected + '" onclick="TeeTimesPage.selectWhenType(\'' + opt.type + '\')">';
        html += '<span class="tt-dropdown-text">' + opt.label + '</span>';
        html += '</div>';
      });
      html += '</div>';

      // Calendar placeholder
      html += '<div class="tt-dropdown-section">';
      html += '<div class="tt-dropdown-title">' + T('pickDateLabel', 'Pick a Date') + '</div>';
      html += _renderMiniCalendar();
      html += '</div>';

      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ── Mini Calendar ──
  function _renderMiniCalendar(){
    var today = new Date();
    var currentMonth = today.getMonth();
    var currentYear = today.getFullYear();

    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    var html = '<div class="tt-calendar">';

    // Header
    html += '<div class="tt-calendar-header">';
    html += '<button class="tt-calendar-nav" onclick="event.stopPropagation();">&#9664;</button>';
    html += '<span class="tt-calendar-month">' + monthNames[currentMonth] + ' ' + currentYear + '</span>';
    html += '<button class="tt-calendar-nav" onclick="event.stopPropagation();">&#9654;</button>';
    html += '</div>';

    // Day headers
    html += '<div class="tt-calendar-days">';
    dayNames.forEach(function(d){
      html += '<div class="tt-calendar-day-header">' + d + '</div>';
    });
    html += '</div>';

    // Calendar grid
    var firstDay = new Date(currentYear, currentMonth, 1).getDay();
    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    html += '<div class="tt-calendar-grid">';

    // Empty cells for days before the 1st
    for(var i = 0; i < firstDay; i++){
      html += '<div class="tt-calendar-cell tt-calendar-cell-empty"></div>';
    }

    // Days
    for(var day = 1; day <= daysInMonth; day++){
      var date = new Date(currentYear, currentMonth, day);
      var isToday = isSameDate(date, today);
      var isSelected = _state.when && isSameDate(date, _state.when.date);
      var isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());

      var cellClass = 'tt-calendar-cell';
      if(isToday) cellClass += ' tt-calendar-cell-today';
      if(isSelected) cellClass += ' tt-calendar-cell-selected';
      if(isPast) cellClass += ' tt-calendar-cell-past';

      var onclick = isPast ? '' : ' onclick="TeeTimesPage.selectWhenDate(' + date.getTime() + ')"';

      html += '<div class="' + cellClass + '"' + onclick + '>';
      html += '<span class="tt-calendar-day-num">' + day + '</span>';
      html += '</div>';
    }

    html += '</div>';
    html += '</div>';

    return html;
  }

  // ── Players Field ──
  function _renderPlayersField(){
    var label = _state.players + ' ' + (_state.players === 1 ? T('playerSingular', 'Player') : T('playerPlural', 'Players'));
    var activeClass = _ui.showPlayersDropdown ? ' tt-field-active' : '';
    var filledClass = ' tt-field-filled';

    var html = '<div class="tt-intent-field' + activeClass + filledClass + '" id="tt-field-players">';
    html += '<div class="tt-field-inner" onclick="TeeTimesPage.togglePlayers()">';
    html += '<div class="tt-field-label">' + T('playersLabel', 'Players') + '</div>';
    html += '<div class="tt-field-value">' + label + '</div>';
    html += '<div class="tt-field-arrow">&#9662;</div>';
    html += '</div>';

    // Dropdown
    if(_ui.showPlayersDropdown){
      html += '<div class="tt-dropdown tt-dropdown-narrow">';
      html += '<div class="tt-dropdown-section">';

      for(var p = 1; p <= 4; p++){
        var selected = _state.players === p ? ' tt-dropdown-item-selected' : '';
        var playerLabel = p + ' ' + (p === 1 ? T('playerSingular', 'Player') : T('playerPlural', 'Players'));
        html += '<div class="tt-dropdown-item' + selected + '" onclick="TeeTimesPage.selectPlayers(' + p + ')">';
        html += '<span class="tt-dropdown-text">' + playerLabel + '</span>';
        html += '</div>';
      }

      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ── Access Field ──
  function _renderAccessField(){
    var accessLabels = {
      all: T('accessAll', 'All Tee Times'),
      public: T('accessPublic', 'Public'),
      member: T('accessMember', 'Member')
    };
    var label = accessLabels[_state.access] || accessLabels.all;
    var activeClass = _ui.showAccessDropdown ? ' tt-field-active' : '';
    var filledClass = ' tt-field-filled';

    var html = '<div class="tt-intent-field' + activeClass + filledClass + '" id="tt-field-access">';
    html += '<div class="tt-field-inner" onclick="TeeTimesPage.toggleAccess()">';
    html += '<div class="tt-field-label">' + T('accessLabel', 'Access') + '</div>';
    html += '<div class="tt-field-value">' + label + '</div>';
    html += '<div class="tt-field-arrow">&#9662;</div>';
    html += '</div>';

    // Dropdown
    if(_ui.showAccessDropdown){
      html += '<div class="tt-dropdown tt-dropdown-narrow">';
      html += '<div class="tt-dropdown-section">';

      var options = [
        { key: 'all', label: accessLabels.all, icon: '&#127758;' },
        { key: 'public', label: accessLabels.public, icon: '&#128101;' },
        { key: 'member', label: accessLabels.member, icon: '&#128273;' }
      ];

      options.forEach(function(opt){
        var selected = _state.access === opt.key ? ' tt-dropdown-item-selected' : '';
        html += '<div class="tt-dropdown-item' + selected + '" onclick="TeeTimesPage.selectAccess(\'' + opt.key + '\')">';
        html += '<span class="tt-dropdown-icon">' + opt.icon + '</span>';
        html += '<span class="tt-dropdown-text">' + opt.label + '</span>';
        html += '</div>';
      });

      html += '</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  // ══════════════════════════════════════════
  // RESULTS AREA (Placeholder)
  // ══════════════════════════════════════════

  function _renderResultsArea(){
    var html = '<div class="tt-results-area">';

    // Results header
    html += '<div class="tt-results-header">';
    html += '<div class="tt-results-count">' + T('resultsPlaceholder', 'Enter search criteria to find tee times') + '</div>';
    html += '</div>';

    // Results list placeholder
    html += '<div class="tt-results-list">';
    html += '<div class="tt-results-empty">';
    html += '<div class="tt-results-empty-icon">&#9971;</div>';
    html += '<div class="tt-results-empty-title">' + T('readyToSearchTitle', 'Ready to Find Tee Times') + '</div>';
    html += '<div class="tt-results-empty-text">' + T('readyToSearchText', 'Use the filters above to search for available tee times at your favorite courses.') + '</div>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ══════════════════════════════════════════
  // INTERACTION HANDLERS
  // ══════════════════════════════════════════

  // ── Where ──
  function toggleWhere(){
    _closeAllDropdowns();
    _ui.showWhereDropdown = !_ui.showWhereDropdown;
    render();
  }

  function selectWhere(location){
    _state.where = location;
    _ui.showWhereDropdown = false;
    render();
  }

  // ── When ──
  function toggleWhen(){
    _closeAllDropdowns();
    _ui.showWhenDropdown = !_ui.showWhenDropdown;
    render();
  }

  function selectWhenType(type){
    var date = new Date();

    if(type === 'tomorrow'){
      date.setDate(date.getDate() + 1);
    } else if(type === 'weekend'){
      // Find next Saturday
      var daysUntilSaturday = (6 - date.getDay() + 7) % 7;
      if(daysUntilSaturday === 0) daysUntilSaturday = 7; // If today is Saturday, go to next week
      date.setDate(date.getDate() + daysUntilSaturday);
    }

    _state.when = {
      type: type,
      date: date,
      label: formatDateLabel(date, type)
    };
    _ui.showWhenDropdown = false;
    render();
  }

  function selectWhenDate(timestamp){
    var date = new Date(timestamp);
    _state.when = {
      type: 'date',
      date: date,
      label: formatDateLabel(date, 'date')
    };
    _ui.showWhenDropdown = false;
    render();
  }

  // ── Players ──
  function togglePlayers(){
    _closeAllDropdowns();
    _ui.showPlayersDropdown = !_ui.showPlayersDropdown;
    render();
  }

  function selectPlayers(count){
    _state.players = count;
    _ui.showPlayersDropdown = false;
    render();
  }

  // ── Access ──
  function toggleAccess(){
    _closeAllDropdowns();
    _ui.showAccessDropdown = !_ui.showAccessDropdown;
    render();
  }

  function selectAccess(access){
    _state.access = access;
    _ui.showAccessDropdown = false;
    render();
  }

  // ── Search ──
  function search(){
    console.log('[TeeTimesPage] Search with state:', JSON.parse(JSON.stringify(_state)));
    // TODO: Implement search in Step 5 (TeeTime Card)
    alert('Search functionality will be implemented in Step 5 (TeeTime Card)');
  }

  // ══════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════

  function _closeAllDropdowns(){
    _ui.showWhereDropdown = false;
    _ui.showWhenDropdown = false;
    _ui.showPlayersDropdown = false;
    _ui.showAccessDropdown = false;
  }

  function _wireDocumentClick(){
    // Remove existing listener to avoid duplicates
    document.removeEventListener('click', _onDocumentClick);
    // Add new listener
    setTimeout(function(){
      document.addEventListener('click', _onDocumentClick);
    }, 0);
  }

  function _onDocumentClick(e){
    var fieldIds = ['tt-field-where', 'tt-field-when', 'tt-field-players', 'tt-field-access'];
    var clickedInside = false;

    fieldIds.forEach(function(id){
      var el = document.getElementById(id);
      if(el && el.contains(e.target)){
        clickedInside = true;
      }
    });

    if(!clickedInside){
      var hadOpen = _ui.showWhereDropdown || _ui.showWhenDropdown || _ui.showPlayersDropdown || _ui.showAccessDropdown;
      _closeAllDropdowns();
      if(hadOpen) render();
    }
  }

  function formatDateLabel(date, type){
    var today = new Date();
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if(type === 'today' || isSameDate(date, today)){
      return T('todayLabel', 'Today');
    }
    if(type === 'tomorrow' || isSameDate(date, tomorrow)){
      return T('tomorrowLabel', 'Tomorrow');
    }

    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return dayNames[date.getDay()] + ', ' + monthNames[date.getMonth()] + ' ' + date.getDate();
  }

  function isSameDate(d1, d2){
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  // ══════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════

  init();

  return {
    render: render,
    toggleWhere: toggleWhere,
    selectWhere: selectWhere,
    toggleWhen: toggleWhen,
    selectWhenType: selectWhenType,
    selectWhenDate: selectWhenDate,
    togglePlayers: togglePlayers,
    selectPlayers: selectPlayers,
    toggleAccess: toggleAccess,
    selectAccess: selectAccess,
    search: search
  };

})();

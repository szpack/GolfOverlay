// ============================================================
// newRoundPage.js — New Round page (redesigned v2)
// Route: #/new-round
// Architecture: 4 summary cards + 4 full-screen pickers
// Depends on: NewRoundService, ClubStore, AuthState, Router, T()
// ============================================================

const NewRoundPage = (function(){

  // ── Round Draft State ──
  var _draft = null;
  var _overlayEl = null;
  var _pickerConfirmFn = null;   // confirm callback (called by header confirm btn)
  var _pickerBackFn = null;      // custom back handler (for multi-step pickers)

  function _defaultDraft(){
    return {
      clubId: null,
      clubName: '',
      routeMode: null,            // 'dual-nine' | 'single-layout'
      selectedLayoutId: null,
      selectedLayoutName: '',
      frontNineId: null,
      frontNineName: '',
      backNineId: null,
      backNineName: '',
      courseSummary: '',          // human-readable, e.g. "沙河 · A + B"
      players: [],                // {type:'self'|'member'|'guest', name, playerId?, buddyId?, sortOrder}
      teeTime: null,              // local datetime string "YYYY-MM-DDTHH:MM"
      teeTimeLabel: '',
      visibility: 'public',      // 'private' | 'friends' | 'public'
      visibilityLabel: ''
    };
  }

  function _initDraft(){
    _draft = _defaultDraft();

    // Default tee time: now rounded to 10 min
    var now = new Date();
    now.setMinutes(Math.round(now.getMinutes() / 10) * 10, 0, 0);
    _draft.teeTime = _toLocalDatetime(now);
    _draft.teeTimeLabel = T('nrNowLbl');  // default label, will be refreshed by SummaryHelpers on render

    // Default visibility
    _draft.visibility = 'public';
    _draft.visibilityLabel = typeof SummaryHelpers !== 'undefined'
      ? SummaryHelpers.buildVisibilityLabel('public')
      : T('nrVisPublicLabel');

    // Add self as first player
    _addSelf();
  }

  function _addSelf(){
    var user = (typeof AuthState !== 'undefined' && AuthState.isLoggedIn()) ? AuthState.getUser() : null;
    var player = (typeof AuthState !== 'undefined' && AuthState.isLoggedIn()) ? AuthState.getPlayer() : null;
    var name = (player && player.displayName) || (user && user.displayName) || 'Me';
    _draft.players = [{
      type: 'self',
      name: name,
      playerId: (player && player.id) || null,
      buddyId: null,
      sortOrder: 0
    }];
  }

  /**
   * Normalize players array: ensure self at index 0, continuous sortOrder, no duplicates.
   * This is the central invariant — called after every draft.players write.
   */
  function _normalizePlayers(){
    if(!_draft) return;
    var ps = _draft.players || [];

    // 1. Ensure self exists
    var hasSelf = ps.some(function(p){ return p.type === 'self'; });
    if(!hasSelf){
      var user = (typeof AuthState !== 'undefined' && AuthState.isLoggedIn()) ? AuthState.getUser() : null;
      var player = (typeof AuthState !== 'undefined' && AuthState.isLoggedIn()) ? AuthState.getPlayer() : null;
      var name = (player && player.displayName) || (user && user.displayName) || 'Me';
      ps.unshift({
        type: 'self', name: name,
        playerId: (player && player.id) || null,
        buddyId: null, sortOrder: 0
      });
    }

    // 2. Move self to index 0
    for(var i = 0; i < ps.length; i++){
      if(ps[i].type === 'self' && i > 0){
        var self = ps.splice(i, 1)[0];
        ps.unshift(self);
        break;
      }
    }

    // 3. Deduplicate by playerId → buddyId → normalized name
    var seen = {};
    var deduped = [];
    for(var j = 0; j < ps.length; j++){
      var p = ps[j];
      var key = p.playerId ? 'pid:' + p.playerId
              : p.buddyId  ? 'bid:' + p.buddyId
              : 'name:' + (p.name || '').trim().toLowerCase();
      if(seen[key]) continue;
      seen[key] = true;
      deduped.push(p);
    }

    // 4. Continuous sortOrder
    for(var k = 0; k < deduped.length; k++){
      deduped[k].sortOrder = k;
    }

    _draft.players = deduped;
  }

  // Backward compat alias
  var _ensureSelf = _normalizePlayers;

  // ══════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════

  function render(){
    var el = document.getElementById('page-new-round-content');
    if(!el) return;
    if(!Shell.requireAuth('page-new-round-content')) return;
    if(!_draft) _initDraft();

    try {
      var html = '';

      // Header — back only, no duplicate title
      html += '<div class="nr-header">';
      html += '<button class="cd-back-btn" onclick="NewRoundPage.goBack()">&larr; ' + T('backBtn') + '</button>';
      html += '</div>';

      // 4 Cards
      html += '<div class="nr-cards">';
      html += _renderCourseCard();
      html += _renderPlayersCard();
      html += _renderTeeTimeCard();
      html += _renderVisibilityCard();
      html += '</div>';

      // Create button
      html += _renderCreateButton();

      el.innerHTML = html;
    } catch(e){
      console.error('[NewRoundPage] render error:', e);
      el.innerHTML = '<div style="padding:24px;color:red">Render error: ' + e.message + '</div>';
    }
  }

  // ── Course Card ──
  function _renderCourseCard(){
    var has = !!_draft.clubId;
    var hasSH = typeof SummaryHelpers !== 'undefined';
    var html = '<div class="nr-card' + (has ? ' nr-card-filled' : '') + '" onclick="NewRoundPage.openCoursePicker()">';
    html += '<div class="nr-card-label">' + T('courseLbl') + '</div>';
    html += '<div class="nr-card-row">';
    html += '<div class="nr-card-icon">&#9971;</div>';
    if(has){
      var summary = _draft.courseSummary
        || (hasSH ? SummaryHelpers.buildCourseSummary(_draft) : _draft.clubName);
      html += '<div class="nr-card-value">' + _esc(summary) + '</div>';
    } else {
      html += '<div class="nr-card-value">' + T('nrSelectCourse') + '</div>';
    }
    html += '<div class="nr-card-arrow">&#8250;</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ── Players Card ──
  function _renderPlayersCard(){
    var count = _draft.players.length;
    var selfOnly = count === 1 && _draft.players[0].type === 'self';
    var hasSH = typeof SummaryHelpers !== 'undefined';
    var filled = count > 1 || (count === 1 && !selfOnly);
    var html = '<div class="nr-card' + (filled ? ' nr-card-filled' : '') + '" onclick="NewRoundPage.openBuddyPicker()">';
    html += '<div class="nr-card-label">' + T('playersLbl') + '</div>';
    html += '<div class="nr-card-row">';
    html += '<div class="nr-card-icon">&#128101;</div>';
    if(filled){
      var display = hasSH ? SummaryHelpers.buildPlayersSummary(_draft.players)
                          : _draft.players.map(function(p){ return p.name; }).join(' / ');
      html += '<div class="nr-card-body"><div class="nr-card-value">' + _esc(display) + '</div>';
      if(count > 1) html += '<div class="nr-card-secondary">' + T('nrPersonCount', count) + '</div>';
      html += '</div>';
    } else {
      html += '<div class="nr-card-value">' + T('nrSelectPlayers') + '</div>';
    }
    html += '<div class="nr-card-arrow">&#8250;</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ── Tee Time Card ──
  function _renderTeeTimeCard(){
    var hasSH = typeof SummaryHelpers !== 'undefined';
    var label = _draft.teeTimeLabel
      || (hasSH && _draft.teeTime ? SummaryHelpers.buildTeeTimeLabel(_draft.teeTime) : '')
      || T('nrNowLbl');
    var html = '<div class="nr-card nr-card-filled" onclick="NewRoundPage.openTeeTimePicker()">';
    html += '<div class="nr-card-label">' + T('nrTeeTimeLbl') + '</div>';
    html += '<div class="nr-card-row">';
    html += '<div class="nr-card-icon">&#128337;</div>';
    html += '<div class="nr-card-value">' + _esc(label) + '</div>';
    html += '<div class="nr-card-arrow">&#8250;</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ── Visibility Card ──
  function _renderVisibilityCard(){
    var hasSH = typeof SummaryHelpers !== 'undefined';
    var label = _draft.visibilityLabel
      || (hasSH ? SummaryHelpers.buildVisibilityLabel(_draft.visibility) : _draft.visibility || '');
    var html = '<div class="nr-card nr-card-filled" onclick="NewRoundPage.openVisibilityPicker()">';
    html += '<div class="nr-card-label">' + T('nrVisibilityLbl') + '</div>';
    html += '<div class="nr-card-row">';
    html += '<div class="nr-card-icon">&#128065;</div>';
    html += '<div class="nr-card-value">' + _esc(label) + '</div>';
    html += '<div class="nr-card-arrow">&#8250;</div>';
    html += '</div>';
    html += '</div>';
    return html;
  }

  // ── Create Button ──
  function _renderCreateButton(){
    var errors = _validateDraft();
    var canCreate = errors.length === 0;
    var html = '<div class="nr-footer">';
    html += '<button class="cs-btn cs-btn-primary nr-create-btn"' + (canCreate ? '' : ' disabled') + ' onclick="NewRoundPage.doCreate()">';
    html += T('nrCreateBtn');
    html += '</button>';
    if(!canCreate){
      html += '<div class="nr-hints">';
      for(var i = 0; i < errors.length; i++){
        html += '<div class="nr-hint">' + errors[i] + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function _validateDraft(){
    var errors = [];
    if(!_draft.clubId) errors.push(T('nrHintCourse'));
    if(_draft.clubId && _draft.routeMode === 'dual-nine'){
      if(!_draft.frontNineId) errors.push(T('nrHintFront9'));
      if(!_draft.backNineId) errors.push(T('nrHintBack9'));
    } else if(_draft.clubId && _draft.routeMode === 'single-layout'){
      if(!_draft.selectedLayoutId) errors.push(T('nrHintRouting'));
    } else if(_draft.clubId && !_draft.routeMode){
      errors.push(T('nrHintRouting'));
    }
    var hasSelf = _draft.players.some(function(p){ return p.type === 'self'; });
    if(!hasSelf || _draft.players.length === 0) errors.push(T('nrHintPlayer'));
    if(!_draft.teeTime) errors.push(T('nrHintTeeTime'));
    if(!_draft.visibility) errors.push(T('nrHintVisibility'));
    return errors;
  }

  // ══════════════════════════════════════════
  // PICKER OVERLAY SYSTEM
  // ══════════════════════════════════════════

  function _ensureOverlay(){
    if(_overlayEl) return;
    _overlayEl = document.createElement('div');
    _overlayEl.className = 'nr-picker-overlay';
    // Scope picker within workspace, not full-screen
    var ws = document.getElementById('app-workspace');
    (ws || document.body).appendChild(_overlayEl);
  }

  /**
   * Show picker overlay with unified header (back / title / confirm).
   * @param {string} title - picker title
   * @param {Function} [confirmFn] - called when confirm button is clicked
   * @returns {HTMLElement} body container for picker to render into
   */
  function showPicker(title, confirmFn){
    _ensureOverlay();
    _pickerConfirmFn = confirmFn || null;
    _pickerBackFn = null;

    var html = '<div class="nr-picker-header">';
    html += '<button class="nr-picker-back" onclick="NewRoundPage.pickerBack()">&larr; ' + T('backBtn') + '</button>';
    html += '<span class="nr-picker-title" id="nr-picker-title">' + _esc(title) + '</span>';
    html += '</div>';
    html += '<div class="nr-picker-body" id="nr-picker-body"></div>';
    // Confirm button after body so pickers don't overwrite it
    if(confirmFn){
      html += '<div class="nr-picker-inline-confirm" id="nr-picker-inline-confirm">';
      html += '<button class="cs-btn cs-btn-primary nr-picker-confirm" onclick="NewRoundPage.confirmPicker()">' + T('nrConfirmBtn') + '</button>';
      html += '</div>';
    }

    _overlayEl.innerHTML = html;
    _overlayEl.classList.add('nr-picker-active');
    return document.getElementById('nr-picker-body');
  }

  /** Called by header back button. Delegates to custom handler or closes. */
  function pickerBack(){
    if(_pickerBackFn){
      _pickerBackFn();
    } else {
      closePicker();
    }
  }

  /** Called by header confirm button. */
  function confirmPicker(){
    if(_pickerConfirmFn) _pickerConfirmFn();
  }

  /** Close picker overlay (cancel — does NOT write draft). */
  function closePicker(){
    if(!_overlayEl) return;
    _overlayEl.classList.remove('nr-picker-active');
    _pickerConfirmFn = null;
    _pickerBackFn = null;
    render();
  }

  /** Let pickers override the back button behavior (e.g. multi-step). */
  function setPickerBack(fn){
    _pickerBackFn = fn || null;
  }

  /** Let pickers update the header title (e.g. step change). */
  function setPickerTitle(title){
    var el = _overlayEl && _overlayEl.querySelector('#nr-picker-title');
    if(el) el.textContent = title;
  }

  /** Let pickers show/hide the confirm button. */
  function setPickerConfirm(fn){
    _pickerConfirmFn = fn || null;
    var wrap = _overlayEl && _overlayEl.querySelector('.nr-picker-inline-confirm');
    if(wrap){
      wrap.style.display = fn ? '' : 'none';
    }
  }

  // ══════════════════════════════════════════
  // PICKER OPENERS
  // ══════════════════════════════════════════

  function openCoursePicker(){
    if(typeof CoursePicker !== 'undefined'){
      CoursePicker.show(_draft, function(result){
        _draft.clubId = result.clubId;
        _draft.clubName = result.clubName;
        _draft.routeMode = result.routeMode;
        _draft.selectedLayoutId = result.selectedLayoutId || null;
        _draft.selectedLayoutName = result.selectedLayoutName || '';
        _draft.frontNineId = result.frontNineId || null;
        _draft.frontNineName = result.frontNineName || '';
        _draft.backNineId = result.backNineId || null;
        _draft.backNineName = result.backNineName || '';
        _draft.courseSummary = result.courseSummary || '';
        closePicker();
      });
    } else {
      _stubPicker(T('nrSelectCourse'), 'CoursePicker — P2');
    }
  }

  function openBuddyPicker(){
    if(typeof BuddyPicker !== 'undefined'){
      BuddyPicker.show(_draft, function(result){
        _draft.players = result.players;
        _ensureSelf();
        closePicker();
      });
    } else {
      _stubPicker(T('nrSelectPlayers'), 'BuddyPicker — P3');
    }
  }

  function openTeeTimePicker(){
    if(typeof TeeTimePicker !== 'undefined'){
      TeeTimePicker.show(_draft, function(result){
        _draft.teeTime = result.teeTime;
        _draft.teeTimeLabel = result.teeTimeLabel;
        closePicker();
      });
    } else {
      _stubPicker(T('nrTeeTimeLbl'), 'TeeTimePicker — P4');
    }
  }

  function openVisibilityPicker(){
    if(typeof VisibilityPicker !== 'undefined'){
      VisibilityPicker.show(_draft, function(result){
        _draft.visibility = result.visibility;
        _draft.visibilityLabel = result.visibilityLabel;
        closePicker();
      });
    } else {
      _stubPicker(T('nrVisibilityLbl'), 'VisibilityPicker — P4');
    }
  }

  function _stubPicker(title, label){
    var body = showPicker(title);
    body.innerHTML = '<div class="nr-picker-stub">' + _esc(label) + '</div>';
  }

  // ══════════════════════════════════════════
  // CREATE
  // ══════════════════════════════════════════

  function doCreate(){
    var errors = _validateDraft();
    if(errors.length > 0) return;

    // P5: use draft-driven adapter — no layoutId matching required for dual-nine
    var result = NewRoundService.createFromDraft(_draft);

    if(!result.success){
      alert(result.errors.join('\n'));
      return;
    }

    if(result.activate){
      NewRoundService.activateRound(result);
      _draft = null;
      Router.navigate('/round/' + result.round.id);
    } else {
      NewRoundService.storeScheduledRound(result);
      _draft = null;
      Router.navigate('/rounds');
    }
  }

  // ══════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════

  function goBack(){
    _draft = null;
    Router.navigate('/');
  }

  function _toLocalDatetime(date){
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    var hh = String(date.getHours()).padStart(2, '0');
    var mm = String(date.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + d + 'T' + hh + ':' + mm;
  }

  function _esc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ══════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════

  return {
    render: render,
    goBack: goBack,
    doCreate: doCreate,
    openCoursePicker: openCoursePicker,
    openBuddyPicker: openBuddyPicker,
    openTeeTimePicker: openTeeTimePicker,
    openVisibilityPicker: openVisibilityPicker,
    showPicker: showPicker,
    closePicker: closePicker,
    pickerBack: pickerBack,
    confirmPicker: confirmPicker,
    setPickerBack: setPickerBack,
    setPickerTitle: setPickerTitle,
    setPickerConfirm: setPickerConfirm,
    getDraft: function(){ return _draft; },
    updateDraft: function(updates){
      if(!_draft) return;
      for(var k in updates){
        if(updates.hasOwnProperty(k)) _draft[k] = updates[k];
      }
      _ensureSelf();
      render();
    }
  };

})();

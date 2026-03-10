// ============================================================
// visibilityPicker.js — Visibility selection picker for New Round
// Full-screen overlay: private / friends / public radio cards
// Depends on: NewRoundPage, T()
// ============================================================

const VisibilityPicker = (function(){

  var _onDone = null;    // callback(result) on confirm
  var _bodyEl = null;    // picker body DOM element

  // ── Internal state ──
  var _selected = 'friends'; // 'private' | 'friends' | 'public'

  // ── Option definitions ──
  var OPTIONS = ['private', 'friends', 'public'];

  var NAME_KEYS = {
    'private': 'nrVisPrivateName',
    'friends': 'nrVisFriendsName',
    'public':  'nrVisPublicName'
  };

  var DESC_KEYS = {
    'private': 'nrVisPrivateDesc',
    'friends': 'nrVisFriendsDesc',
    'public':  'nrVisPublicDesc'
  };

  var LABEL_KEYS = {
    'private': 'nrVisPrivateLabel',
    'friends': 'nrVisFriendsLabel',
    'public':  'nrVisPublicLabel'
  };

  // ══════════════════════════════════════════
  // PUBLIC: show
  // ══════════════════════════════════════════

  function show(draft, onDone){
    _onDone = onDone;
    _selected = (draft.visibility && LABEL_KEYS[draft.visibility]) ? draft.visibility : 'friends';

    _bodyEl = NewRoundPage.showPicker(T('nrVisibilityLbl'), _confirm);
    NewRoundPage.setPickerBack(_handleBack);

    _render();
  }

  // ══════════════════════════════════════════
  // CONFIRM / BACK
  // ══════════════════════════════════════════

  function _confirm(){
    var label = T(LABEL_KEYS[_selected]) || _selected;
    _onDone({
      visibility: _selected,
      visibilityLabel: label
    });
  }

  function _handleBack(){
    NewRoundPage.closePicker();
  }

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════

  function _render(){
    if(!_bodyEl) return;
    _bodyEl.innerHTML = _renderContent();
  }

  function _renderContent(){
    var html = '';

    html += '<div class="nr-vis-options">';
    for(var i = 0; i < OPTIONS.length; i++){
      var opt = OPTIONS[i];
      var sel = (_selected === opt);
      html += '<div class="nr-vis-option' + (sel ? ' nr-selected' : '') + '" onclick="VisibilityPicker.select(\'' + opt + '\')">';
      html += '<div class="nr-vis-radio"></div>';
      html += '<div class="nr-vis-body">';
      html += '<div class="nr-vis-name">' + _esc(T(NAME_KEYS[opt])) + '</div>';
      html += '<div class="nr-vis-desc">' + _esc(T(DESC_KEYS[opt])) + '</div>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';

    return html;
  }

  // ══════════════════════════════════════════
  // ACTIONS
  // ══════════════════════════════════════════

  function select(value){
    if(LABEL_KEYS[value]){
      _selected = value;
      _render();
    }
  }

  // ══════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════

  function _esc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ══════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════

  return {
    show: show,
    select: select
  };

})();

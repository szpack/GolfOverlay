// ============================================================
// teeTimePicker.js — Tee time selection picker for New Round
// Full-screen overlay: quick options + custom date/time
// Depends on: NewRoundPage, T()
// ============================================================

const TeeTimePicker = (function(){

  var _onDone = null;    // callback(result) on confirm
  var _bodyEl = null;    // picker body DOM element

  // ── Internal state ──
  var _selectedValue = '';   // ISO local datetime "YYYY-MM-DDTHH:MM"
  var _selectedMode = 'quick'; // 'quick' | 'custom'
  var _quickOption = null;     // 'now' | '10min' | '30min' | '1hr' | null

  // ══════════════════════════════════════════
  // PUBLIC: show
  // ══════════════════════════════════════════

  function show(draft, onDone){
    _onDone = onDone;
    _selectedMode = 'quick';
    _quickOption = null;
    _selectedValue = '';

    // Pre-fill from draft
    if(draft.teeTime){
      _selectedValue = draft.teeTime;
      // Detect if it matches a quick option
      var match = _detectQuickOption(draft.teeTime);
      if(match){
        _selectedMode = 'quick';
        _quickOption = match;
      } else {
        _selectedMode = 'custom';
      }
    }

    _bodyEl = NewRoundPage.showPicker(T('nrTeeTimeLbl'), _confirm);
    NewRoundPage.setPickerBack(_handleBack);

    _render();
  }

  // ══════════════════════════════════════════
  // CONFIRM / BACK
  // ══════════════════════════════════════════

  function _confirm(){
    if(!_selectedValue) return;
    _onDone({
      teeTime: _selectedValue,
      teeTimeLabel: _buildLabel()
    });
  }

  function _handleBack(){
    NewRoundPage.closePicker();
  }

  // ══════════════════════════════════════════
  // TIME HELPERS
  // ══════════════════════════════════════════

  /** Round a Date to the nearest 10 minutes */
  function _roundTo10(d){
    var ms = 10 * 60 * 1000;
    return new Date(Math.round(d.getTime() / ms) * ms);
  }

  /** Convert Date to local ISO string "YYYY-MM-DDTHH:MM" */
  function _toLocalISO(d){
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + 'T' + hh + ':' + mm;
  }

  /** Get date portion "YYYY-MM-DD" from ISO string */
  function _dateOf(iso){
    return iso ? iso.substring(0, 10) : '';
  }

  /** Get time portion "HH:MM" from ISO string */
  function _timeOf(iso){
    return iso ? iso.substring(11, 16) : '';
  }

  /** Compute quick option value for a given key */
  function _quickValue(key){
    var now = new Date();
    var d;
    if(key === 'now'){
      d = _roundTo10(now);
    } else if(key === '10min'){
      d = _roundTo10(new Date(now.getTime() + 10 * 60 * 1000));
    } else if(key === '30min'){
      d = _roundTo10(new Date(now.getTime() + 30 * 60 * 1000));
    } else if(key === '1hr'){
      d = _roundTo10(new Date(now.getTime() + 60 * 60 * 1000));
    } else {
      return '';
    }
    return _toLocalISO(d);
  }

  /** Detect if a given ISO string matches a quick option (within 5min tolerance) */
  function _detectQuickOption(iso){
    if(!iso) return null;
    var t = new Date(iso).getTime();
    var keys = ['now', '10min', '30min', '1hr'];
    for(var i = 0; i < keys.length; i++){
      var qv = _quickValue(keys[i]);
      if(qv && Math.abs(new Date(qv).getTime() - t) < 5 * 60 * 1000){
        return keys[i];
      }
    }
    return null;
  }

  // ══════════════════════════════════════════
  // LABEL
  // ══════════════════════════════════════════

  function _buildLabel(){
    if(!_selectedValue) return '';

    if(_quickOption === 'now'){
      return T('nrNowLbl');
    }

    var d = new Date(_selectedValue);
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var timeStr = hh + ':' + mm;

    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diffDays = Math.round((target - today) / (24 * 60 * 60 * 1000));

    if(diffDays === 0){
      return T('nrTodayLbl') + ' ' + timeStr;
    } else if(diffDays === 1){
      return T('nrTomorrowLbl') + ' ' + timeStr;
    } else {
      // Locale-aware date
      var mon = d.getMonth() + 1;
      var day = d.getDate();
      if(typeof LANG !== 'undefined' && LANG === 'zh'){
        return mon + '\u6708' + day + '\u65e5 ' + timeStr;
      } else {
        return String(mon).padStart(2, '0') + '/' + String(day).padStart(2, '0') + ' ' + timeStr;
      }
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

    // ── Quick Options ──
    html += '<div class="nr-section">';
    html += '<div class="nr-section-title">' + T('nrQuickSelectLbl') + '</div>';
    html += '<div class="nr-quick-times">';

    var quickKeys = ['now', '10min', '30min', '1hr'];
    var quickI18n = ['nrStartNow', 'nrIn10Min', 'nrIn30Min', 'nrIn1Hr'];
    for(var i = 0; i < quickKeys.length; i++){
      var sel = (_selectedMode === 'quick' && _quickOption === quickKeys[i]);
      html += '<button class="nr-quick-btn' + (sel ? ' nr-selected' : '') + '" onclick="TeeTimePicker.selectQuick(\'' + quickKeys[i] + '\')">';
      html += _esc(T(quickI18n[i]));
      html += '</button>';
    }
    html += '</div></div>';

    // ── Custom Date/Time ──
    html += '<div class="nr-section">';
    html += '<div class="nr-section-title">' + T('nrCustomTimeLbl') + '</div>';
    html += '<div class="nr-datetime-inputs">';
    html += '<input type="date" class="nr-input" id="ttp-date" value="' + _esc(_dateOf(_selectedValue)) + '">';
    html += '<input type="time" class="nr-input" id="ttp-time" value="' + _esc(_timeOf(_selectedValue)) + '">';
    html += '</div></div>';

    // ── Preview ──
    var label = _buildLabel();
    if(label){
      html += '<div class="nr-section">';
      html += '<div class="nr-tee-preview">' + _esc(label) + '</div>';
      html += '</div>';
    }

    return html;
  }

  // ══════════════════════════════════════════
  // ACTIONS
  // ══════════════════════════════════════════

  function selectQuick(key){
    _selectedMode = 'quick';
    _quickOption = key;
    _selectedValue = _quickValue(key);
    _render();
  }

  // ══════════════════════════════════════════
  // EVENTS
  // ══════════════════════════════════════════

  function _wireEvents(){
    var dateInput = document.getElementById('ttp-date');
    var timeInput = document.getElementById('ttp-time');

    if(dateInput){
      dateInput.addEventListener('change', function(){
        _selectedMode = 'custom';
        _quickOption = null;
        _updateFromInputs();
        _render();
      });
    }
    if(timeInput){
      timeInput.addEventListener('change', function(){
        _selectedMode = 'custom';
        _quickOption = null;
        _updateFromInputs();
        _render();
      });
    }
  }

  function _updateFromInputs(){
    var dateInput = document.getElementById('ttp-date');
    var timeInput = document.getElementById('ttp-time');
    var dateVal = dateInput ? dateInput.value : '';
    var timeVal = timeInput ? timeInput.value : '';

    if(dateVal && timeVal){
      _selectedValue = dateVal + 'T' + timeVal;
    } else if(dateVal){
      _selectedValue = dateVal + 'T00:00';
    } else if(timeVal){
      // Use today's date
      var now = new Date();
      var y = now.getFullYear();
      var m = String(now.getMonth() + 1).padStart(2, '0');
      var d = String(now.getDate()).padStart(2, '0');
      _selectedValue = y + '-' + m + '-' + d + 'T' + timeVal;
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
    selectQuick: selectQuick
  };

})();

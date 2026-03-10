// ============================================================
// summaryHelpers.js — Reusable summary label functions
// for New Round page card displays
// Depends on: T()
// ============================================================

const SummaryHelpers = (function(){

  // ── buildCourseSummary ──
  // Returns a display label for the selected course/club.
  function buildCourseSummary(draft) {
    if (!draft || !draft.clubId) return '';

    var clubName = draft.clubName || '';

    if (draft.routeMode === 'dual-nine' && draft.frontNineName && draft.backNineName) {
      return clubName + ' \u00b7 ' + draft.frontNineName + ' + ' + draft.backNineName;
    }
    if (draft.routeMode === 'single-layout' && (draft.selectedLayoutName || draft.layoutName)) {
      return clubName + ' \u00b7 ' + (draft.selectedLayoutName || draft.layoutName);
    }
    return clubName;
  }

  // ── buildPlayersSummary ──
  // Returns a compact player list string for card display.
  function buildPlayersSummary(players) {
    if (!players || players.length === 0) return '';

    var names = [];
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var name = (p && p.name) ? p.name : '';
      if (name) names.push(name);
    }

    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length <= 3) return names.join(' / ');

    // 4+ players: show first 3 + count
    var remaining = names.length - 3;
    return names[0] + ' / ' + names[1] + ' / ' + names[2] + ' / +' + remaining;
  }

  // ── buildTeeTimeLabel ──
  // Formats an ISO local datetime string into a human-readable label.
  function buildTeeTimeLabel(value) {
    if (!value) return '';

    var parts = value.split('T');
    if (parts.length < 2) return '';

    var dateParts = parts[0].split('-');
    var timeParts = parts[1].split(':');

    var year  = parseInt(dateParts[0], 10);
    var month = parseInt(dateParts[1], 10);
    var day   = parseInt(dateParts[2], 10);
    var hour  = parseInt(timeParts[0], 10);
    var min   = parseInt(timeParts[1], 10);

    var target = new Date(year, month - 1, day, hour, min, 0);
    var now = new Date();

    // Check within 5 minutes of now
    var diffMs = Math.abs(target.getTime() - now.getTime());
    if (diffMs <= 5 * 60 * 1000) {
      return T('nrNowLbl');
    }

    // Format HH:MM zero-padded
    var hh = hour < 10 ? '0' + hour : '' + hour;
    var mm = min  < 10 ? '0' + min  : '' + min;
    var timeStr = hh + ':' + mm;

    // Same calendar day
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var targetDay  = new Date(year, month - 1, day);

    var dayDiff = Math.round((targetDay.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));

    if (dayDiff === 0) {
      return T('nrTodayLbl') + ' ' + timeStr;
    }
    if (dayDiff === 1) {
      return T('nrTomorrowLbl') + ' ' + timeStr;
    }

    // Otherwise: M/D HH:MM
    return month + '/' + day + ' ' + timeStr;
  }

  // ── buildVisibilityLabel ──
  // Maps visibility value to localized label.
  function buildVisibilityLabel(value) {
    if (!value) return '';

    var map = {
      'private': 'nrVisPrivateLabel',
      'friends': 'nrVisFriendsLabel',
      'public':  'nrVisPublicLabel'
    };

    var key = map[value];
    if (key) return T(key);
    return value || '';
  }

  // ── Public API ──
  return {
    buildCourseSummary:    buildCourseSummary,
    buildPlayersSummary:   buildPlayersSummary,
    buildTeeTimeLabel:     buildTeeTimeLabel,
    buildVisibilityLabel:  buildVisibilityLabel
  };

})();

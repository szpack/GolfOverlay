// ============================================================
// profilePage.js — User profile page
// Route: #/profile
// Depends on: AuthState, ApiClient, Router, T()
// ============================================================

const ProfilePage = (function(){

  var _editing = false;
  var _saving = false;
  var _error = '';
  var _success = '';
  var _avatarPreview = null;  // base64 data URL for preview

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════

  function render(){
    var el = document.getElementById('page-profile-content');
    if(!el) return;

    _editing = false;
    _saving = false;
    _error = '';
    _success = '';
    _avatarPreview = null;

    if(!AuthState.isLoggedIn()){
      el.innerHTML = '<div class="profile-card"><p class="profile-guest">' + T('notSignedIn') + '</p>' +
        '<a href="#/login" class="auth-submit" style="display:inline-block;text-align:center;text-decoration:none;margin-top:12px">' + T('signInBtn') + '</a></div>';
      return;
    }

    _renderInner(el);
  }

  function _renderInner(el){
    el = el || document.getElementById('page-profile-content');
    if(!el) return;

    var user = AuthState.getUser();
    var player = AuthState.getPlayer();
    if(!user){ el.innerHTML = ''; return; }

    var html = '<div class="profile-card">';

    // Header with avatar
    html += '<div class="profile-header">';
    var avatarSrc = _avatarPreview || (player && player.avatarUrl) || null;
    if(avatarSrc){
      html += '<img class="profile-avatar profile-avatar-img" src="' + _esc(avatarSrc) + '" alt="">';
    } else {
      html += '<div class="profile-avatar">' + _esc((user.displayName || '?').charAt(0)).toUpperCase() + '</div>';
    }
    html += '<div class="profile-info">';
    html += '<div class="profile-name">' + _esc(user.displayName) + '</div>';
    html += '<div class="profile-email">' + _esc(user.email || '') + '</div>';
    html += '</div>';
    html += '</div>';

    if(_error){
      html += '<div class="auth-error">' + _esc(_error) + '</div>';
    }
    if(_success){
      html += '<div class="profile-success">' + _esc(_success) + '</div>';
    }

    // Account section
    html += '<div class="profile-section">';
    html += '<div class="profile-section-title">' + T('accountLbl') + '</div>';
    html += '<div class="profile-row"><span class="profile-label">' + T('nameLbl') + '</span>';
    if(_editing){
      html += '<input type="text" id="profile-edit-name" class="profile-input" value="' + _esc(user.displayName) + '" maxlength="50">';
    } else {
      html += '<span class="profile-value">' + _esc(user.displayName) + '</span>';
    }
    html += '</div>';
    html += '<div class="profile-row"><span class="profile-label">Email</span><span class="profile-value">' + _esc(user.email || '—') + '</span></div>';

    // Golf ID row with copy button
    var golfId = user.golfId || '—';
    html += '<div class="profile-row"><span class="profile-label">' + T('yourIdLbl') + '</span>';
    html += '<span class="profile-value profile-id-value">';
    html += '<code class="profile-id-code">' + _esc(golfId) + '</code>';
    html += '<button class="profile-copy-btn" id="profile-copy-id" onclick="ProfilePage.copyId()">' + T('copyIdBtn') + '</button>';
    html += '</span></div>';
    html += '</div>';

    // Avatar section (in edit mode)
    if(_editing){
      html += '<div class="profile-section">';
      html += '<div class="profile-section-title">Avatar</div>';
      html += '<div class="profile-row">';
      html += '<button class="profile-btn-edit profile-avatar-btn" onclick="document.getElementById(\'profile-avatar-input\').click()">' + T('changeAvatarBtn') + '</button>';
      if(avatarSrc){
        html += '<button class="profile-btn-cancel profile-avatar-btn" onclick="ProfilePage.removeAvatar()">' + T('removeAvatarBtn') + '</button>';
      }
      html += '<input type="file" id="profile-avatar-input" accept="image/*" style="display:none" onchange="ProfilePage.onAvatarSelected(this)">';
      html += '</div>';
      html += '</div>';
    }

    // Player section
    if(player){
      html += '<div class="profile-section">';
      html += '<div class="profile-section-title">' + T('defaultPlayerLbl') + '</div>';
      html += '<div class="profile-row"><span class="profile-label">' + T('nameLbl') + '</span>';
      if(_editing){
        html += '<input type="text" id="profile-edit-player-name" class="profile-input" value="' + _esc(player.displayName) + '" maxlength="50">';
      } else {
        html += '<span class="profile-value">' + _esc(player.displayName) + '</span>';
      }
      html += '</div>';
      html += '<div class="profile-row"><span class="profile-label">' + T('handicapLbl') + '</span>';
      if(_editing){
        html += '<input type="number" id="profile-edit-handicap" class="profile-input profile-input-sm" value="' + (player.handicap != null ? player.handicap : '') + '" min="-10" max="54" step="0.1">';
      } else {
        html += '<span class="profile-value">' + (player.handicap != null ? player.handicap : '—') + '</span>';
      }
      html += '</div>';
      html += '</div>';
    }

    // Actions
    html += '<div class="profile-actions">';
    if(_editing){
      html += '<button class="auth-submit" onclick="ProfilePage.save()"' + (_saving ? ' disabled' : '') + '>' + (_saving ? T('savingLbl') : T('saveLbl')) + '</button>';
      html += '<button class="profile-btn-cancel" onclick="ProfilePage.cancelEdit()">' + T('cancelBtn') + '</button>';
    } else {
      html += '<button class="profile-btn-edit" onclick="ProfilePage.startEdit()">' + T('editProfileBtn') + '</button>';
    }
    html += '</div>';

    // Logout
    html += '<div class="profile-logout">';
    html += '<button class="profile-btn-logout" onclick="ProfilePage.doLogout()">' + T('signOutBtn') + '</button>';
    html += '</div>';

    html += '</div>';
    el.innerHTML = html;
  }

  function startEdit(){
    _editing = true;
    _error = '';
    _success = '';
    _avatarPreview = null;
    _renderInner();
  }

  function cancelEdit(){
    _editing = false;
    _error = '';
    _avatarPreview = null;
    _renderInner();
  }

  function copyId(){
    var user = AuthState.getUser();
    if(!user || !user.golfId) return;
    navigator.clipboard.writeText(user.golfId).then(function(){
      var btn = document.getElementById('profile-copy-id');
      if(btn){
        btn.textContent = T('copiedLbl');
        setTimeout(function(){ btn.textContent = T('copyIdBtn'); }, 1500);
      }
    }).catch(function(){});
  }

  function onAvatarSelected(input){
    if(!input.files || !input.files[0]) return;
    var file = input.files[0];
    if(file.size > 500000){
      _error = 'Avatar too large (max 500KB)';
      _renderInner();
      return;
    }
    var reader = new FileReader();
    reader.onload = function(){
      _avatarPreview = reader.result;
      _renderInner();
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar(){
    _avatarPreview = 'REMOVE';
    _renderInner();
  }

  async function save(){
    if(_saving) return;
    _saving = true;
    _error = '';
    _success = '';
    _renderInner();

    var nameInput = document.getElementById('profile-edit-name');
    var playerNameInput = document.getElementById('profile-edit-player-name');
    var hcpInput = document.getElementById('profile-edit-handicap');

    try {
      // Update user
      if(nameInput){
        var name = nameInput.value.trim();
        if(name){
          var res = await ApiClient.patch('/api/v1/me', { displayName: name });
          if(!res.ok){
            var d = await ApiClient.json(res);
            _error = (d && d.error) || 'Failed to update name';
            _saving = false;
            _renderInner();
            return;
          }
        }
      }

      // Update player (including avatar)
      var body = {};
      if(playerNameInput) body.displayName = playerNameInput.value.trim();
      if(hcpInput) body.handicap = hcpInput.value ? Number(hcpInput.value) : null;
      if(_avatarPreview === 'REMOVE'){
        body.avatarBase64 = null;
      } else if(_avatarPreview){
        body.avatarBase64 = _avatarPreview;
      }

      if(Object.keys(body).length > 0){
        var res2 = await ApiClient.patch('/api/v1/players/me/default', body);
        if(!res2.ok){
          var d2 = await ApiClient.json(res2);
          _error = (d2 && d2.error) || 'Failed to update player';
          _saving = false;
          _renderInner();
          return;
        }
      }

      // Refresh auth state
      await AuthState.refreshMe();
      _saving = false;
      _editing = false;
      _avatarPreview = null;
      _success = T('profileUpdated');
      _renderInner();
    } catch(e){
      _saving = false;
      _error = T('networkErrorMsg');
      _renderInner();
    }
  }

  async function doLogout(){
    await AuthState.logout();
    Router.navigate('/');
  }

  function _esc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    render: render,
    startEdit: startEdit,
    cancelEdit: cancelEdit,
    save: save,
    doLogout: doLogout,
    copyId: copyId,
    onAvatarSelected: onAvatarSelected,
    removeAvatar: removeAvatar
  };

})();

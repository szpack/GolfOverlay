// ============================================================
// deviceId.js — Persistent device identifier
//
// Generates and stores a UUID per device in localStorage.
// Used for sync queue attribution and multi-device debugging.
// ============================================================

var DeviceId = (function(){
  var LS_KEY = 'golf_v7_device_id';
  var _id = null;

  function _generate(){
    // crypto.randomUUID where available, otherwise fallback
    if(typeof crypto !== 'undefined' && crypto.randomUUID){
      return 'dev_' + crypto.randomUUID();
    }
    // Fallback: manual UUID v4
    return 'dev_' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function get(){
    if(_id) return _id;
    try {
      _id = localStorage.getItem(LS_KEY);
    } catch(e){}
    if(!_id){
      _id = _generate();
      try { localStorage.setItem(LS_KEY, _id); } catch(e){}
    }
    return _id;
  }

  return { get: get };
})();

(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.StudyBridgeDrafts=factory();})(globalThis,function(){
  'use strict';
  const prefix='studybridge.draft.v1.';
  function create(storage){
    const key=(user,scope)=>prefix+JSON.stringify([user,scope]);
    return {
      read(user,scope){if(!user)return null;try{const row=JSON.parse(storage.getItem(key(user,scope))||'null');if(!row||row.version!==1||Date.now()-row.savedAt>30*86400000)return null;return row.data;}catch{return null;}},
      write(user,scope,data){if(!user)return false;try{const raw=JSON.stringify({version:1,savedAt:Date.now(),data});if(raw.length>800000)return false;storage.setItem(key(user,scope),raw);return true;}catch{return false;}},
      remove(user,scope){try{storage.removeItem(key(user,scope));return true;}catch{return false;}}
    };
  }
  return {create};
});

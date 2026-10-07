(() => {
  const VERSION = "20261007-layout-loader-2";
  if (window.__studybridgeLayoutFix === VERSION) return;
  window.__studybridgeLayoutFix = VERSION;

  function loadScriptOnce(src) {
    const cleanPath = new URL(src.split("?")[0], location.href).pathname;
    const registry = (window.__studybridgeLoadedScripts ||= new Set());
    if (registry.has(cleanPath)) return;
    const exists = Array.from(document.scripts).some((script) => {
      const value = script.getAttribute("src");
      return value && new URL(value, location.href).pathname === cleanPath;
    });
    registry.add(cleanPath);
    if (exists) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = src;
    script.addEventListener("error", () => registry.delete(cleanPath), { once: true });
    document.body.appendChild(script);
  }

  function installStyle() {
    if (document.querySelector("#studybridge-layout-fix-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-layout-fix-style";
    style.textContent = `
      #appShell{min-height:100vh!important}
      .workspace{min-width:0!important;overflow:hidden!important}
      #workspacePage{min-height:0!important}
      body:not(.creator-clean-mode) #chatArea{min-height:0!important;overflow-y:auto!important;overscroll-behavior:contain!important;padding-bottom:130px!important}
      body:not(.creator-clean-mode) #quickPrompts{border-top:1px solid rgba(216,222,232,.72)!important;background:rgba(244,246,249,.96)!important}
      body:not(.creator-clean-mode) #chatForm{position:relative!important;z-index:4!important;background:rgba(244,246,249,.98)!important;padding-bottom:18px!important}
      body.creator-clean-mode .profile-entry,body.creator-clean-mode .study-entry,body.creator-clean-mode .community-entry,body.creator-clean-mode .classmates-entry,body.creator-clean-mode .email-helper-entry,body.creator-clean-mode .schedule-entry,body.creator-clean-mode .sidebar>.panel,body.creator-clean-mode #workspacePage>.topbar,body.creator-clean-mode #scheduleDashboard,body.creator-clean-mode #chatArea,body.creator-clean-mode #quickPrompts,body.creator-clean-mode #chatForm{display:none!important}
      body.creator-clean-mode #appShell{height:100vh!important;overflow:hidden!important}
      body.creator-clean-mode .workspace,body.creator-clean-mode .sidebar{height:100vh!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important}
      body.creator-clean-mode #workspacePage{display:block!important;overflow:visible!important;background:#f4f6f9!important}
      body.creator-clean-mode #developerPanel:not([hidden]){display:block!important;max-height:none!important;min-height:0!important;margin:0!important;padding:20px 28px 44px!important;border:0!important;box-shadow:none!important;background:#f4f6f9!important;overflow:visible!important}
      body.creator-clean-mode #developerPanel .invite-list,body.creator-clean-mode #developerPanel .user-list,body.creator-clean-mode #passwordResetList{max-height:none!important;overflow:visible!important}
      #openStudyAreaButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton{display:grid!important;grid-template-columns:34px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;width:100%!important;min-height:48px!important;max-height:56px!important;padding:9px 12px!important;overflow:hidden!important;cursor:pointer!important}
      #openStudyAreaButton .small-button,#openSchoolCommunityButton .small-button,#openClassmatesButton .small-button,#openEmailReplyButton .small-button,#openScheduleButton .small-button{display:none!important}
      #openStudyAreaButton *,#openSchoolCommunityButton *,#openClassmatesButton *,#openEmailReplyButton *,#openScheduleButton *{pointer-events:none!important}
    `;
    document.head.appendChild(style);
  }

  function ensureStudyEntry() {
    if (document.querySelector("#openStudyAreaButton")) return;
    const profile = document.querySelector("#openProfilePageButton");
    if (!profile) return;
    const button = document.createElement("button");
    button.id = "openStudyAreaButton";
    button.type = "button";
    button.className = "study-entry";
    button.innerHTML = '<span class="study-entry-icon">学</span><span><strong>学习区</strong><span>课程资料、AI 对话和复习计划</span></span>';
    const first = document.querySelector("#openSchoolCommunityButton") || profile.nextElementSibling;
    if (first) first.insertAdjacentElement("beforebegin", button);
    else profile.insertAdjacentElement("afterend", button);
  }

  function syncCreatorMode() {
    const panel = document.querySelector("#developerPanel");
    document.body.classList.toggle("creator-clean-mode", Boolean(panel && !panel.hidden));
  }

  function boot() {
    installStyle();
    ensureStudyEntry();
    syncCreatorMode();
  }

  loadScriptOnce("/student-navigation-hotfix.js?v=20261007-2");
  loadScriptOnce("/sidebar-direct-router.js?v=20261007-nav-hardening-2");
  loadScriptOnce("/school-autocomplete.js?v=20261005-1");
  loadScriptOnce("/admin-console-patch.js?v=20261005-1");
  loadScriptOnce("/system-status-patch.js?v=20261007-1");
  loadScriptOnce("/admin-boundary-patch.js?v=20261006-1");
  loadScriptOnce("/profile-onboarding-patch.js?v=20261005-1");
  loadScriptOnce("/profile-onboarding-fix.js?v=20261005-1");
  loadScriptOnce("/google-auth-patch.js?v=20261005-1");
  loadScriptOnce("/profile-fields-patch.js?v=20261005-3");
  loadScriptOnce("/major-autocomplete.js?v=20261005-1");
  loadScriptOnce("/school-datalist-patch.js?v=20261005-1");
  loadScriptOnce("/us-school-library-patch.js?v=20261005-1");
  loadScriptOnce("/school-community-patch.js?v=20261007-2");
  loadScriptOnce("/classmates-patch.js?v=20261005-2");
  loadScriptOnce("/classmates-request-patch.js?v=20261007-2");
  loadScriptOnce("/classmate-chat-bubble-fix.js?v=20261006-1");
  loadScriptOnce("/cheatsheet-mode-patch.js?v=20261006-1");
  loadScriptOnce("/study-chat-bottom-fix.js?v=20261007-6");
  loadScriptOnce("/email-reply-patch.js?v=20261007-2");
  loadScriptOnce("/schedule-patch.js?v=20261007-2");
  loadScriptOnce("/schedule-dashboard-patch.js?v=20261006-2");
  loadScriptOnce("/schedule-notification-patch.js?v=20261005-2");
  loadScriptOnce("/page-restore-patch.js?v=20261007-3");

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  new MutationObserver(() => requestAnimationFrame(boot)).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
})();

(() => {
  const VERSION = "20261007-chat-compact-style-5";
  if (window.__studybridgeChatBubbleCompactLive === VERSION) return;
  window.__studybridgeChatBubbleCompactLive = VERSION;

  function loadStableRouter() {
    if (window.studybridgeNavigationHotfixOpen) return;
    const src = "/student-navigation-hotfix.js?v=20261007-3";
    const path = new URL(src.split("?")[0], location.href).pathname;
    const exists = Array.from(document.scripts).some((script) => {
      const value = script.getAttribute("src");
      return value && new URL(value, location.href).pathname === path;
    });
    if (exists) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = src;
    document.body.appendChild(script);
  }

  function installStyle() {
    if (document.querySelector("#studybridge-chat-bubble-compact-live-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-chat-bubble-compact-live-style";
    style.textContent = `
      #classmatesPage .direct-message-list{align-content:end!important;gap:10px!important;padding-bottom:18px!important}
      #classmatesPage .direct-message{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:end!important;gap:16px!important;box-sizing:border-box!important;width:fit-content!important;min-width:min(360px,72vw)!important;max-width:min(720px,86%)!important;min-height:0!important;height:auto!important;padding:9px 14px!important;line-height:1.42!important;white-space:pre-wrap!important}
      #classmatesPage .direct-message>span{display:block!important;min-width:0!important}
      #classmatesPage .direct-message.mine{justify-self:end!important}
      #classmatesPage .direct-message time{display:block!important;align-self:end!important;margin:0!important;white-space:nowrap!important;text-align:right!important}
      #openProfilePageButton,#editProfileButton,#openStudyAreaButton,#openSchoolCommunityButton,#openClassmatesButton,#openEmailReplyButton,#openScheduleButton,#profileCard{pointer-events:auto!important;cursor:pointer!important}
      #openProfilePageButton *,#editProfileButton *,#openStudyAreaButton *,#openSchoolCommunityButton *,#openClassmatesButton *,#openEmailReplyButton *,#openScheduleButton *{pointer-events:none!important}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    loadStableRouter();
    installStyle();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();

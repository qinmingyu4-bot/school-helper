(() => {
  const VERSION = "20261007-master-bridge-1";
  if (window.__studybridgeSidebarDirectRouter === VERSION) return;
  window.__studybridgeSidebarDirectRouter = VERSION;

  const MASTER_PATH = "/student-navigation-master.js";
  const MASTER_SRC = `${MASTER_PATH}?v=20261007-master-nav-3`;
  const pageToRoute = {
    workspacePage: "study",
    profilePage: "profile",
    schoolCommunityPage: "community",
    classmatesPage: "classmates",
    emailReplyPage: "email",
    schedulePage: "schedule",
    developerPanel: "developer"
  };

  function hasMasterRouter() {
    if (window.studybridgeMasterOpen || window.studybridgeOpenMainPage) return true;
    return Array.from(document.scripts).some((script) => {
      const src = script.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).pathname === MASTER_PATH;
      } catch {
        return src.includes(MASTER_PATH);
      }
    });
  }

  function loadMasterRouter() {
    if (hasMasterRouter()) return;
    const script = document.createElement("script");
    script.async = false;
    script.src = MASTER_SRC;
    document.body.appendChild(script);
  }

  function openPage(pageId) {
    loadMasterRouter();
    const routeName = pageToRoute[pageId] || pageId;
    const start = Date.now();
    const timer = setInterval(() => {
      if (window.studybridgeMasterOpen) {
        clearInterval(timer);
        window.studybridgeMasterOpen(routeName);
      } else if (Date.now() - start > 3000) {
        clearInterval(timer);
      }
    }, 50);
  }

  window.studybridgeDirectOpen = (pageId) => openPage(pageId);
  window.studybridgeOpenStudentPage = (pageId) => openPage(pageId);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadMasterRouter, { once: true });
  } else {
    loadMasterRouter();
  }
})();

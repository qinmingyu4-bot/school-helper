(() => {
if (window.__studybridgeDeveloperAccessFix === "20261007-4") return;
window.__studybridgeDeveloperAccessFix = "20261007-4";
const SECONDARY_PAGES = ["profilePage", "schoolCommunityPage", "classmatesPage", "emailReplyPage", "schedulePage"];
const WORKSPACE_CHROME = [".topbar", "#scheduleDashboard", "#chatArea", "#quickPrompts", "#chatForm"];
let creatorRepairTimer = 0;
function isAdminUser() { const roleSwitch = document.querySelector("#roleSwitch"); return Boolean(roleSwitch && !roleSwitch.hidden); }
function setWorkspaceChromeHidden(hidden) { const workspacePage = document.querySelector("#workspacePage"); if (!workspacePage) return; WORKSPACE_CHROME.forEach((selector) => { const element = workspacePage.querySelector(":scope > " + selector); if (element) element.hidden = hidden; }); }
function hideSecondaryPages() { SECONDARY_PAGES.forEach((id) => { const page = document.querySelector("#" + id); if (page) page.hidden = true; }); }
function setButtonState(creatorMode) { const studentButton = document.querySelector("#studentViewButton"); const creatorButton = document.querySelector("#creatorViewButton"); if (studentButton) studentButton.classList.toggle("active", !creatorMode); if (creatorButton) creatorButton.classList.toggle("active", creatorMode); }
function openCreatorMode() { if (!isAdminUser()) return; try { localStorage.setItem("studybridgeWorkspaceMode", "creator"); } catch {} const workspacePage = document.querySelector("#workspacePage"); const developerPanel = document.querySelector("#developerPanel"); if (workspacePage) { workspacePage.hidden = false; workspacePage.style.display = ""; workspacePage.style.visibility = "visible"; } hideSecondaryPages(); setWorkspaceChromeHidden(true); if (developerPanel) developerPanel.hidden = false; document.body.classList.add("creator-clean-mode", "admin-boundary-active"); document.body.classList.remove("study-sidebar-hidden", "studybridge-page-switching", "studybridge-direct-routing", "studybridge-secondary-page"); document.body.dataset.studybridgeActivePage = "developerPanel"; setButtonState(true); }
function openStudentMode() { try { localStorage.setItem("studybridgeWorkspaceMode", "student"); } catch {} clearTimeout(creatorRepairTimer); creatorRepairTimer = 0; const developerPanel = document.querySelector("#developerPanel"); if (developerPanel) developerPanel.hidden = true; setWorkspaceChromeHidden(false); document.body.classList.remove("creator-clean-mode", "admin-boundary-active", "studybridge-secondary-page"); document.body.dataset.studybridgeActivePage = "workspacePage"; setButtonState(false); }
function repairCreatorMode() { clearTimeout(creatorRepairTimer); openCreatorMode(); creatorRepairTimer = setTimeout(openCreatorMode, 140); }
function bindButtons() { const creatorButton = document.querySelector("#creatorViewButton"); const studentButton = document.querySelector("#studentViewButton"); if (creatorButton && creatorButton.dataset.developerAccessFix !== "20261007-4") { creatorButton.dataset.developerAccessFix = "20261007-4"; ["click", "keydown"].forEach((eventName) => { creatorButton.addEventListener(eventName, (event) => { if (eventName === "keydown" && event.key !== "Enter" && event.key !== " ") return; setTimeout(repairCreatorMode, 0); }, true); }); } if (studentButton && studentButton.dataset.developerAccessFix !== "20261007-4") { studentButton.dataset.developerAccessFix = "20261007-4"; ["click", "keydown"].forEach((eventName) => { studentButton.addEventListener(eventName, (event) => { if (eventName === "keydown" && event.key !== "Enter" && event.key !== " ") return; setTimeout(openStudentMode, 0); }, true); }); } }
function restoreExpectedMode() { if (!isAdminUser()) return; let mode = ""; try { mode = localStorage.getItem("studybridgeWorkspaceMode") || ""; } catch {} if (mode === "creator") repairCreatorMode(); }
function boot() { bindButtons(); restoreExpectedMode(); }
boot();
setTimeout(boot, 350);
setTimeout(boot, 1200);
new MutationObserver(bindButtons).observe(document.documentElement, { childList: true, subtree: true });
})();

(() => {
  const VERSION = "20261008-route-layout-repair-1.0.71";
  if (window.__studybridgeRouteLayoutRepair === VERSION) return;
  window.__studybridgeRouteLayoutRepair = VERSION;

  const ROUTES = {
    profile: ["#profileCard", "#editProfileButton", "#openProfilePageButton", ".profile-card"],
    community: ["#openSchoolCommunityButton", ".community-entry"],
    classmates: ["#openClassmatesButton", ".classmates-entry"],
    email: ["#openEmailReplyButton", ".email-helper-entry"],
    schedule: ["#openScheduleButton", ".schedule-entry"],
    study: ["#openStudyAreaButton", ".study-entry", "#studentViewButton"],
    developer: ["#creatorViewButton"]
  };

  const featureClasses = [
    "community-entry",
    "classmates-entry",
    "email-helper-entry",
    "schedule-entry",
    "study-entry"
  ];

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function installStyle() {
    let style = $("#studybridge-route-layout-repair-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "studybridge-route-layout-repair-style";
      document.head.appendChild(style);
    }
    style.textContent = `
      body.sb-route-page #workspacePage,
      body.sb-route-developer #workspacePage {
        display: block !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
      body.sb-route-page #studybridgeRoutePage,
      body.sb-route-developer #studybridgeRoutePage {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        min-height: calc(100dvh - 48px) !important;
      }
      body.sb-route-page #workspacePage > .topbar,
      body.sb-route-page #workspacePage > #scheduleDashboard,
      body.sb-route-page #workspacePage > #chatArea,
      body.sb-route-page #workspacePage > #quickPrompts,
      body.sb-route-page #workspacePage > #chatForm,
      body.sb-route-page #workspacePage > .composer,
      body.sb-route-developer #workspacePage > .topbar,
      body.sb-route-developer #workspacePage > #scheduleDashboard,
      body.sb-route-developer #workspacePage > #chatArea,
      body.sb-route-developer #workspacePage > #quickPrompts,
      body.sb-route-developer #workspacePage > #chatForm,
      body.sb-route-developer #workspacePage > .composer {
        display: none !important;
      }
      body.sb-route-study #workspacePage {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) auto auto !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        overflow: hidden !important;
      }
      body.sb-route-study #studybridgeRoutePage {
        display: none !important;
      }
      #openSchoolCommunityButton,
      #openClassmatesButton,
      #openEmailReplyButton,
      #openScheduleButton,
      #openStudyAreaButton,
      #creatorViewButton,
      #studentViewButton,
      #profileCard,
      #editProfileButton {
        pointer-events: auto !important;
        cursor: pointer !important;
      }
    `;
  }

  function routeFromTarget(target) {
    if (!target?.closest) return "";
    const explicit = target.closest("[data-route]")?.dataset.route ||
      target.closest("[data-studybridge-route]")?.dataset.studybridgeRoute;
    if (explicit && ROUTES[explicit]) return explicit;
    for (const [route, selectors] of Object.entries(ROUTES)) {
      if (selectors.some((selector) => target.closest(selector))) return route;
    }
    return "";
  }

  function dedupeFeatureCards() {
    featureClasses.forEach((className) => {
      const nodes = $$(`.${className}`);
      nodes.slice(1).forEach((node) => node.remove());
    });
    [
      ["openSchoolCommunityButton", "community"],
      ["openClassmatesButton", "classmates"],
      ["openEmailReplyButton", "email"],
      ["openScheduleButton", "schedule"],
      ["openStudyAreaButton", "study"],
      ["creatorViewButton", "developer"],
      ["studentViewButton", "study"]
    ].forEach(([id, route]) => {
      const nodes = $$(`#${id}`);
      nodes.slice(1).forEach((node) => node.remove());
      if (nodes[0]) {
        nodes[0].dataset.route = route;
        nodes[0].style.pointerEvents = "auto";
      }
    });
  }

  function normalizeRouteState(route) {
    const workspace = $("#workspacePage");
    if (workspace) {
      workspace.hidden = false;
      workspace.style.removeProperty("display");
      workspace.style.removeProperty("visibility");
      workspace.style.removeProperty("opacity");
    }

    if (route === "study") {
      document.body.classList.remove(
        "sb-route-page",
        "sb-route-developer",
        "studybridge-secondary-page",
        "study-sidebar-hidden",
        "creator-clean-mode",
        "admin-boundary-active"
      );
      document.body.classList.add("sb-route-study");
      document.body.dataset.studybridgeActivePage = "workspacePage";
      return;
    }

    if (route) {
      document.body.classList.remove("sb-route-study", "creator-clean-mode", "admin-boundary-active");
      document.body.classList.add("sb-route-page", "studybridge-secondary-page");
      document.body.dataset.studybridgeActivePage = "studybridgeRoutePage";
    }
  }

  function openRoute(route) {
    if (!route) return;
    normalizeRouteState(route);
    if (typeof window.studybridgeOpenRoute === "function") {
      window.studybridgeOpenRoute(route);
    }
    window.setTimeout(() => {
      normalizeRouteState(route);
      dedupeFeatureCards();
    }, 60);
    window.setTimeout(() => {
      normalizeRouteState(route);
      dedupeFeatureCards();
    }, 260);
  }

  function handleNavigation(event) {
    const route = routeFromTarget(event.target);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openRoute(route);
  }

  async function postJson(path, body) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed.");
    return payload;
  }

  function fieldValue(selector) {
    return $(selector)?.value?.trim() || "";
  }

  function setMessage(text) {
    const message = $("#authMessage");
    if (message) message.textContent = text;
  }

  async function handleAuthSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "authForm") return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const submit = $("#authSubmit");
    const mode = $("[data-auth-mode].active")?.dataset.authMode || "login";
    const payload = {
      name: fieldValue("#nameInput"),
      email: fieldValue("#emailInput"),
      password: fieldValue("#passwordInput"),
      inviteCode: fieldValue("#inviteInput")
    };

    setMessage("");
    if (submit) submit.disabled = true;

    try {
      await postJson(`/api/auth/${mode}`, payload);
      setMessage(mode === "register" ? "Register success. Entering StudyBridge..." : "Login success. Entering StudyBridge...");
      window.location.reload();
    } catch (error) {
      setMessage(error.message || "Login failed. Please try again.");
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function repair() {
    installStyle();
    dedupeFeatureCards();
    if (document.body.classList.contains("sb-route-page")) normalizeRouteState("page");
  }

  document.addEventListener("click", handleNavigation, true);
  document.addEventListener("pointerup", handleNavigation, true);
  document.addEventListener("submit", handleAuthSubmit, true);
  document.addEventListener("DOMContentLoaded", repair, { once: true });
  window.setInterval(repair, 2500);
  repair();
})();

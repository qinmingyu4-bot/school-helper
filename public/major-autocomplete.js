(() => {
  const majors = [
    { name: "Business Administration", aliases: ["business", "bus", "bba", "management", "commerce"], area: "Business", examples: "case study, presentation, marketing, operations, management" },
    { name: "Accounting", aliases: ["accounting", "acct", "audit", "tax"], area: "Business", examples: "financial statements, audit, tax, managerial accounting" },
    { name: "Finance", aliases: ["finance", "fin", "investment", "banking"], area: "Business", examples: "valuation, markets, corporate finance, portfolio analysis" },
    { name: "Marketing", aliases: ["marketing", "market", "digital marketing", "brand"], area: "Business", examples: "consumer behavior, branding, campaign strategy, analytics" },
    { name: "Economics", aliases: ["economics", "econ", "microeconomics", "macroeconomics"], area: "Social Science", examples: "models, graphs, policy, statistics, market behavior" },
    { name: "Engineering", aliases: ["engineering", "engineer", "eng", "en"], area: "Engineering", examples: "problem sets, design projects, lab reports, technical reasoning" },
    { name: "Computer Engineering", aliases: ["computer engineering", "ce", "ece", "comp eng"], area: "Engineering", examples: "circuits, embedded systems, hardware/software systems" },
    { name: "Electrical Engineering", aliases: ["electrical", "electrical engineering", "ee", "electronics"], area: "Engineering", examples: "circuits, signals, power, electronics, control systems" },
    { name: "Mechanical Engineering", aliases: ["mechanical", "mechanical engineering", "mech", "me"], area: "Engineering", examples: "mechanics, thermodynamics, CAD, design, manufacturing" },
    { name: "Civil Engineering", aliases: ["civil", "civil engineering", "structural", "construction"], area: "Engineering", examples: "structures, transportation, materials, project planning" },
    { name: "Computer Science", aliases: ["computer science", "cs", "comp sci", "programming", "software"], area: "Technology", examples: "algorithms, code, debugging, data structures, systems" },
    { name: "Software Engineering", aliases: ["software engineering", "software", "swe", "software dev"], area: "Technology", examples: "software design, testing, architecture, team projects" },
    { name: "Data Science", aliases: ["data science", "data", "analytics", "machine learning", "ml"], area: "Technology", examples: "statistics, Python/R, machine learning, visualization" },
    { name: "Information Technology", aliases: ["information technology", "it", "information systems", "is"], area: "Technology", examples: "networks, databases, systems, cybersecurity basics" },
    { name: "Nursing", aliases: ["nursing", "nurse", "health care", "healthcare"], area: "Health", examples: "clinical reasoning, care plans, patient communication" },
    { name: "Biology", aliases: ["biology", "bio", "life science", "bioscience"], area: "Science", examples: "cells, genetics, lab reports, ecology, physiology" },
    { name: "Psychology", aliases: ["psychology", "psych", "cognitive", "mental health"], area: "Social Science", examples: "research methods, theories, experiments, essays" },
    { name: "Education", aliases: ["education", "teaching", "teacher", "pedagogy"], area: "Education", examples: "lesson plans, classroom practice, reflection, assessment" },
    { name: "English", aliases: ["english", "literature", "writing", "creative writing"], area: "Humanities", examples: "essay structure, close reading, argument, citation" },
    { name: "Media and Communication", aliases: ["media", "communication", "communications", "journalism"], area: "Arts / Media", examples: "writing, audience analysis, campaigns, production" },
    { name: "Graphic Design", aliases: ["graphic design", "design", "visual design", "ux", "ui"], area: "Design", examples: "portfolio, critique, visual hierarchy, design process" },
    { name: "Hospitality and Tourism", aliases: ["hospitality", "tourism", "hotel", "restaurant"], area: "Applied Business", examples: "service operations, guest experience, event planning" },
    { name: "Social Work", aliases: ["social work", "social service", "community service"], area: "Social Service", examples: "case notes, ethics, policy, community resources" },
    { name: "Criminology", aliases: ["criminology", "criminal justice", "law enforcement"], area: "Social Science", examples: "policy, theory, case studies, research writing" },
    { name: "Architecture", aliases: ["architecture", "arch", "architectural"], area: "Design / Built Environment", examples: "studio critique, drawings, design concepts, precedents" },
    { name: "Mathematics", aliases: ["math", "mathematics", "statistics", "stats"], area: "Science", examples: "proofs, formulas, problem solving, modeling" }
  ];

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function searchMajors(query) {
    const q = normalize(query);
    if (!q) return [];
    return majors
      .map((major) => {
        const names = [major.name, major.area, ...(major.aliases || [])].map(normalize);
        let score = 0;
        if (names.some((name) => name === q)) score = 100;
        else if (names.some((name) => name.startsWith(q))) score = 85;
        else if (names.some((name) => name.split(" ").some((part) => part.startsWith(q)))) score = 70;
        else if (names.some((name) => name.includes(q))) score = 45;
        return { major, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.major.name.localeCompare(b.major.name))
      .slice(0, 8)
      .map((item) => item.major);
  }

  function findMajor(name) {
    const q = normalize(name);
    return majors.find((major) => [major.name, major.area, ...(major.aliases || [])].some((candidate) => normalize(candidate) === q));
  }

  function installStyle() {
    if (document.querySelector("#studybridge-major-autocomplete-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-major-autocomplete-style";
    style.textContent = `
      .major-field-shell { position: relative; }
      .major-suggest-list {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        z-index: 55;
        display: grid;
        gap: 6px;
        max-height: 260px;
        overflow: auto;
        padding: 8px;
        border: 1px solid #d8e2ef;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 18px 44px rgba(25, 36, 58, 0.16);
      }
      .major-suggest-list[hidden] { display: none; }
      .major-suggest-option {
        display: grid;
        gap: 3px;
        padding: 10px 11px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: #f8fbff;
        color: var(--ink);
        text-align: left;
      }
      .major-suggest-option:hover,
      .major-suggest-option.is-active { border-color: var(--green); background: #ffffff; }
      .major-suggest-name { color: var(--navy); font-weight: 900; }
      .major-suggest-meta { color: var(--muted); font-size: 12px; line-height: 1.35; }
      .major-suggest-empty { padding: 10px; color: var(--muted); font-size: 12px; }
      .major-match-card {
        display: grid;
        gap: 8px;
        margin-top: 4px;
        padding: 12px;
        border: 1px solid #d8e2ef;
        border-radius: 8px;
        background: #f8fbff;
      }
      .major-match-card[hidden] { display: none; }
      .major-match-card h4 { margin: 0; color: var(--navy); font-size: 14px; }
      .major-match-card p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    `;
    document.head.appendChild(style);
  }

  function setupInput(input) {
    if (!input || input.dataset.majorAutocompleteReady === "true") return;
    input.dataset.majorAutocompleteReady = "true";
    input.setAttribute("autocomplete", "off");

    const label = input.closest("label");
    const shell = document.createElement("div");
    shell.className = "major-field-shell";
    input.parentNode.insertBefore(shell, input);
    shell.appendChild(input);

    const list = document.createElement("div");
    list.className = "major-suggest-list";
    list.hidden = true;
    shell.appendChild(list);

    const matchCard = document.createElement("section");
    matchCard.className = "major-match-card";
    matchCard.hidden = true;
    if (label) label.insertAdjacentElement("afterend", matchCard);

    let matches = [];
    let activeIndex = -1;

    function renderMatchCard(major) {
      if (!major) {
        matchCard.hidden = true;
        return;
      }
      matchCard.hidden = false;
      matchCard.innerHTML = `
        <h4>${escapeHtml(major.name)}</h4>
        <p>${escapeHtml(major.area)} · AI 会更贴近 ${escapeHtml(major.examples)} 来给例子和学习计划。</p>
      `;
    }

    function chooseMajor(major) {
      input.value = major.name;
      list.hidden = true;
      renderMatchCard(major);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function renderList() {
      const value = input.value.trim();
      matches = searchMajors(value);
      activeIndex = matches.length ? 0 : -1;
      if (!value) {
        list.hidden = true;
        renderMatchCard(null);
        return;
      }
      if (!matches.length) {
        list.hidden = false;
        list.innerHTML = `<div class="major-suggest-empty">专业库暂时没有匹配项。你仍然可以手动输入，AI 会使用你保存的专业名称。</div>`;
        renderMatchCard(null);
        return;
      }
      list.hidden = false;
      list.innerHTML = matches
        .map(
          (major, index) => `
            <button class="major-suggest-option${index === activeIndex ? " is-active" : ""}" type="button" data-major-index="${index}">
              <span class="major-suggest-name">${escapeHtml(major.name)}</span>
              <span class="major-suggest-meta">${escapeHtml(major.area)} · ${escapeHtml(major.examples)}</span>
            </button>
          `
        )
        .join("");
      renderMatchCard(matches[0]);
    }

    input.addEventListener("input", renderList);
    input.addEventListener("focus", renderList);
    input.addEventListener("keydown", (event) => {
      if (list.hidden || !matches.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = (activeIndex + 1) % matches.length;
        renderList();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex = (activeIndex - 1 + matches.length) % matches.length;
        renderList();
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        chooseMajor(matches[activeIndex]);
      } else if (event.key === "Escape") {
        list.hidden = true;
      }
    });

    list.addEventListener("mousedown", (event) => {
      const button = event.target.closest("[data-major-index]");
      if (!button) return;
      event.preventDefault();
      chooseMajor(matches[Number(button.dataset.majorIndex)]);
    });

    document.addEventListener("click", (event) => {
      if (!shell.contains(event.target)) list.hidden = true;
    });

    const current = findMajor(input.value);
    if (current) renderMatchCard(current);
  }

  function setupAutocomplete() {
    installStyle();
    setupInput(document.querySelector("#majorInput"));
    setupInput(document.querySelector("#onboardingMajorInput"));
  }

  setupAutocomplete();
  document.addEventListener("click", () => setTimeout(setupAutocomplete, 80), true);
  let tries = 0;
  const timer = setInterval(() => {
    setupAutocomplete();
    tries += 1;
    if (tries > 60) clearInterval(timer);
  }, 250);
})();
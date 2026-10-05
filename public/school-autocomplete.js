(() => {
  const schools = [
    {
      name: "Centennial College",
      aliases: ["centennial", "centennial college", "百年理工学院", "百年学院"],
      type: "Public college: QS 大学综合排名不适用",
      place: "Toronto / Eastern Greater Toronto Area, Ontario, Canada",
      traits: ["Ontario 第一所 public community college，成立于 1966 年。", "课程偏 applied / career-focused，适合项目、presentation、placement 和就业导向学习。", "国际化和多元文化氛围明显，适合国际学生适应加拿大课堂。"],
      note: "看 Centennial 时更应该关注专业、校区、placement/co-op 和课程要求，而不是 QS 综合大学排名。"
    },
    {
      name: "University of Toronto",
      aliases: ["uoft", "u of t", "多伦多大学", "toronto university"],
      type: "Research university: QS 2026 #29",
      place: "Toronto, Ontario, Canada",
      traits: ["加拿大顶尖研究型大学。", "St. George 校区连接市中心资源。", "科研、商科、CS、生命科学等方向资源强。"],
      note: "AI 回答可以更贴近大型 research university 的课程节奏和考试要求。"
    },
    {
      name: "University of British Columbia",
      aliases: ["ubc", "英属哥伦比亚大学", "british columbia"],
      type: "Research university: QS 2026 #40",
      place: "Vancouver / Okanagan, British Columbia, Canada",
      traits: ["研究和国际化程度高。", "环境、可持续发展、生命科学较强。", "温哥华校区连接太平洋城市资源。"],
      note: "适合把学习计划连接到 research、lab、fieldwork 或项目制课程。"
    },
    {
      name: "McGill University",
      aliases: ["mcgill", "麦吉尔大学"],
      type: "Research university: QS 2026 #27",
      place: "Montreal, Quebec, Canada",
      traits: ["加拿大历史悠久的研究型大学。", "医学、法律、工程、管理等声誉强。", "蒙特利尔双语城市环境明显。"],
      note: "AI 可以在解释中兼顾英语课堂和魁北克学习环境。"
    },
    {
      name: "University of Waterloo",
      aliases: ["waterloo", "滑铁卢大学"],
      type: "Research university: QS 2026 #119=",
      place: "Waterloo, Ontario, Canada",
      traits: ["Co-op 实习体系很有代表性。", "数学、计算机、工程和创业生态强。", "适合偏实践、就业和项目经验的学习规划。"],
      note: "AI 回答可以更强调 project、co-op 和技术面试式准备。"
    },
    {
      name: "University of Alberta",
      aliases: ["ualberta", "uofa", "阿尔伯塔大学"],
      type: "Research university: QS 2026 #94=",
      place: "Edmonton, Alberta, Canada",
      traits: ["加拿大大型研究型大学。", "工程、能源、AI、健康科学资源强。", "适合关注科研和省内产业机会的学生。"],
      note: "可以把课程帮助更贴近 research、lab 和专业实习方向。"
    },
    {
      name: "York University",
      aliases: ["york", "约克大学"],
      type: "Public university",
      place: "Toronto, Ontario, Canada",
      traits: ["多伦多大型公立大学。", "商科、法律、社会科学、艺术传媒等方向常见。", "通勤型校园和多元学生群体明显。"],
      note: "适合把时间管理、commuter schedule 和 assignment planning 纳入建议。"
    },
    {
      name: "Toronto Metropolitan University",
      aliases: ["tmu", "ryerson", "toronto metropolitan", "多伦多都会大学"],
      type: "Public university",
      place: "Downtown Toronto, Ontario, Canada",
      traits: ["城市型校园。", "传媒、商科、工程、设计和职业导向课程较常见。", "适合把课堂学习连接到 Toronto industry context。"],
      note: "AI 可以多给应用型例子、presentation 框架和项目拆解。"
    },
    {
      name: "University of Ottawa",
      aliases: ["uottawa", "ottawa", "渥太华大学"],
      type: "Public research university",
      place: "Ottawa, Ontario, Canada",
      traits: ["位于加拿大首都。", "双语环境明显。", "公共政策、法律、健康科学和社科资源突出。"],
      note: "适合结合政策、双语和 government context 做学习解释。"
    },
    {
      name: "University of Calgary",
      aliases: ["ucalgary", "calgary", "卡尔加里大学"],
      type: "Public research university",
      place: "Calgary, Alberta, Canada",
      traits: ["研究型大学。", "能源、工程、商科和健康相关方向常见。", "与 Alberta 产业环境连接较强。"],
      note: "AI 可以把例子更贴近工程、能源和 applied research。"
    },
    {
      name: "University of Victoria",
      aliases: ["uvic", "victoria", "维多利亚大学"],
      type: "Public research university",
      place: "Victoria, British Columbia, Canada",
      traits: ["BC 省研究型大学。", "环境、海洋、公共事务和 co-op 资源常见。", "校园学习节奏较适合长期项目规划。"],
      note: "AI 可以更强调 research writing、fieldwork 和 co-op planning。"
    },
    {
      name: "University of Windsor",
      aliases: ["uwindsor", "windsor", "温莎大学"],
      type: "Public university",
      place: "Windsor, Ontario, Canada",
      traits: ["靠近美加边境。", "工程、商科、教育和法学方向常见。", "适合关注就业、实习和跨境产业环境。"],
      note: "AI 可以在学习建议里加入 career-focused planning。"
    },
    {
      name: "Western University",
      aliases: ["western", "uwo", "西安大略大学"],
      type: "Public research university",
      place: "London, Ontario, Canada",
      traits: ["加拿大研究型大学。", "商科、健康科学、社科和工程方向常见。", "校园文化和社团资源较活跃。"],
      note: "适合把 case study、essay 和 exam review 做得更结构化。"
    },
    {
      name: "Queen's University",
      aliases: ["queens", "queen's", "皇后大学"],
      type: "Public research university",
      place: "Kingston, Ontario, Canada",
      traits: ["研究型大学。", "商科、工程、政策、健康科学等方向常见。", "小城市校园氛围明显。"],
      note: "AI 可以更强调 seminar discussion、case analysis 和写作结构。"
    },
    {
      name: "University of Manitoba",
      aliases: ["umanitoba", "manitoba", "曼尼托巴大学"],
      type: "Public research university",
      place: "Winnipeg, Manitoba, Canada",
      traits: ["Manitoba 省大型研究型大学。", "农业、工程、健康科学和社科方向常见。", "适合稳扎稳打的学期规划。"],
      note: "AI 可以把复习计划拆成更清楚的 weekly milestones。"
    },
    {
      name: "University of Saskatchewan",
      aliases: ["usask", "saskatchewan", "萨斯喀彻温大学"],
      type: "Public research university",
      place: "Saskatoon, Saskatchewan, Canada",
      traits: ["加拿大草原省份研究型大学。", "农业、生物、健康、工程和环境相关方向常见。", "科研和实验课程场景较多。"],
      note: "AI 可以更重视 lab notes、research summary 和 technical writing。"
    },
    {
      name: "University of Guelph",
      aliases: ["guelph", "圭尔夫大学"],
      type: "Public university",
      place: "Guelph, Ontario, Canada",
      traits: ["食品、农业、兽医、生命科学方向知名。", "校园型学习环境明显。", "适合把课程内容连接到实践和实验。"],
      note: "AI 可以更好支持 lab report、concept review 和 applied examples。"
    },
    {
      name: "University of Montreal",
      aliases: ["universite de montreal", "udem", "蒙特利尔大学"],
      type: "Public research university",
      place: "Montreal, Quebec, Canada",
      traits: ["法语研究型大学。", "医学、生命科学、社科和 AI 生态资源较强。", "适合法语或双语学习环境。"],
      note: "如果课程是法语/英语混合，可以在偏好里说明语言要求。"
    },
    {
      name: "University of Southern California",
      aliases: ["usc", "南加州大学"],
      type: "Private research university",
      place: "Los Angeles, California, USA",
      traits: ["研究型私立大学。", "传媒、商科、工程、电影艺术等方向强。", "LA 行业资源和 alumni network 明显。"],
      note: "AI 可以把项目、networking 和 presentation 做得更职业化。"
    },
    {
      name: "University of California, Berkeley",
      aliases: ["uc berkeley", "berkeley", "加州大学伯克利"],
      type: "Public research university",
      place: "Berkeley, California, USA",
      traits: ["世界级公立研究型大学。", "CS、工程、商科、社科和自然科学资源强。", "课程强度通常较高。"],
      note: "AI 可以更强调 problem set、exam strategy 和 research reading。"
    },
    {
      name: "University of California, Los Angeles",
      aliases: ["ucla", "加州大学洛杉矶"],
      type: "Public research university",
      place: "Los Angeles, California, USA",
      traits: ["大型公立研究型大学。", "影视传媒、生命科学、工程、社科等方向常见。", "城市资源和校园活动丰富。"],
      note: "AI 可以结合大课、discussion section 和 midterm/final 节奏规划。"
    },
    {
      name: "University of Washington",
      aliases: ["uw", "uw seattle", "washington", "华盛顿大学"],
      type: "Public research university",
      place: "Seattle, Washington, USA",
      traits: ["研究型公立大学。", "CS、工程、医学、数据和生命科学资源强。", "Seattle tech ecosystem 明显。"],
      note: "AI 可以更多给 technical project、research 和 career-linked examples。"
    },
    {
      name: "University of Michigan",
      aliases: ["umich", "michigan", "密歇根大学"],
      type: "Public research university",
      place: "Ann Arbor, Michigan, USA",
      traits: ["大型研究型公立大学。", "工程、商科、公共政策、社科和医学资源强。", "校园学术和社团资源丰富。"],
      note: "AI 可以帮助做 dense reading、case study 和 exam prep。"
    },
    {
      name: "University of Pennsylvania",
      aliases: ["upenn", "penn", "宾夕法尼亚大学"],
      type: "Private research university",
      place: "Philadelphia, Pennsylvania, USA",
      traits: ["Ivy League 研究型大学。", "商科、经济、社科、医学和工程资源强。", "跨学科学习机会多。"],
      note: "AI 可以更强调 case analysis、academic writing 和 research framing。"
    }
  ];

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function searchSchools(query) {
    const q = normalize(query);
    if (!q) return [];
    const ranked = schools.map((school) => {
      const names = [school.name, ...(school.aliases || [])];
      const normalizedNames = names.map(normalize);
      let score = 0;
      if (normalizedNames.some((name) => name === q)) score = 100;
      else if (normalizedNames.some((name) => name.startsWith(q))) score = 80;
      else if (normalizedNames.some((name) => name.split(" ").some((part) => part.startsWith(q)))) score = 65;
      else if (normalizedNames.some((name) => name.includes(q))) score = 45;
      return { school, score };
    });
    return ranked.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.school.name.localeCompare(b.school.name)).slice(0, 8).map((item) => item.school);
  }

  function findSchool(name) {
    const q = normalize(name);
    return schools.find((school) => [school.name, ...(school.aliases || [])].some((candidate) => normalize(candidate) === q));
  }

  function installStyle() {
    if (document.querySelector("#studybridge-school-autocomplete-style")) return;
    const style = document.createElement("style");
    style.id = "studybridge-school-autocomplete-style";
    style.textContent = `
      .school-field-shell { position: relative; }
      .school-suggest-list {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        z-index: 40;
        display: grid;
        gap: 6px;
        max-height: 280px;
        overflow: auto;
        padding: 8px;
        border: 1px solid #d8e2ef;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 18px 44px rgba(25, 36, 58, 0.16);
      }
      .school-suggest-list[hidden] { display: none; }
      .school-suggest-option {
        display: grid;
        gap: 3px;
        padding: 10px 11px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: #f8fbff;
        color: var(--ink);
        text-align: left;
      }
      .school-suggest-option:hover,
      .school-suggest-option.is-active {
        border-color: var(--green);
        background: #ffffff;
      }
      .school-suggest-name { font-weight: 900; color: var(--navy); }
      .school-suggest-meta { color: var(--muted); font-size: 12px; line-height: 1.35; }
      .school-suggest-empty { padding: 10px; color: var(--muted); font-size: 12px; }
      .school-match-card {
        display: grid;
        gap: 10px;
        margin-top: 4px;
        padding: 12px;
        border: 1px solid #d8e2ef;
        border-radius: 8px;
        background: #f8fbff;
      }
      .school-match-card[hidden] { display: none; }
      .school-match-card h4 { margin: 0; color: var(--navy); font-size: 14px; }
      .school-match-card p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
      .school-match-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .school-match-tags span { padding: 5px 8px; border-radius: 999px; background: #eaf3ff; color: var(--navy); font-size: 11px; font-weight: 800; }
    `;
    document.head.appendChild(style);
  }

  function renderInsight(school) {
    const content = document.querySelector(".profile-preview-content");
    if (!content || !school) return;
    let card = document.querySelector("#schoolInsightCard");
    if (!card) {
      card = document.createElement("section");
      card.id = "schoolInsightCard";
      card.className = "school-insight-card";
      content.appendChild(card);
    }
    card.hidden = false;
    card.innerHTML = `
      <h4>${escapeHtml(school.name)} 概览</h4>
      <div class="school-insight-grid">
        <div class="school-insight-pill"><span>类型 / 排名</span><strong>${escapeHtml(school.type)}</strong></div>
        <div class="school-insight-pill"><span>地点</span><strong>${escapeHtml(school.place)}</strong></div>
      </div>
      <ul class="school-traits">${school.traits.map((trait) => `<li>${escapeHtml(trait)}</li>`).join("")}</ul>
      <p class="school-insight-note">${escapeHtml(school.note)} 具体专业、课程和申请要求请以学校官网为准。</p>
    `;
  }

  function setupAutocomplete() {
    installStyle();
    const input = document.querySelector("#schoolInput");
    if (!input || input.dataset.schoolAutocompleteReady === "true") return;
    input.dataset.schoolAutocompleteReady = "true";

    const label = input.closest("label");
    const shell = document.createElement("div");
    shell.className = "school-field-shell";
    input.parentNode.insertBefore(shell, input);
    shell.appendChild(input);

    const list = document.createElement("div");
    list.className = "school-suggest-list";
    list.hidden = true;
    shell.appendChild(list);

    const matchCard = document.createElement("section");
    matchCard.className = "school-match-card";
    matchCard.hidden = true;
    label.insertAdjacentElement("afterend", matchCard);

    let activeIndex = -1;
    let matches = [];

    function renderMatchCard(school) {
      if (!school) {
        matchCard.hidden = true;
        return;
      }
      matchCard.hidden = false;
      matchCard.innerHTML = `
        <h4>${escapeHtml(school.name)}</h4>
        <div class="school-match-tags">
          <span>${escapeHtml(school.type)}</span>
          <span>${escapeHtml(school.place)}</span>
        </div>
        <p>${escapeHtml(school.traits[0] || school.note || "这所学校的信息会帮助 AI 更客制化地回答。")}</p>
      `;
      renderInsight(school);
    }

    function chooseSchool(school) {
      input.value = school.name;
      list.hidden = true;
      renderMatchCard(school);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      setTimeout(() => renderInsight(school), 40);
    }

    function renderList() {
      const value = input.value.trim();
      matches = searchSchools(value);
      activeIndex = matches.length ? 0 : -1;
      if (!value) {
        list.hidden = true;
        renderMatchCard(null);
        return;
      }
      if (!matches.length) {
        list.hidden = false;
        list.innerHTML = `<div class="school-suggest-empty">资料库暂时没有匹配学校。你仍然可以手动输入，保存后 AI 会使用这个学校名称。</div>`;
        renderMatchCard(null);
        return;
      }
      list.hidden = false;
      list.innerHTML = matches
        .map(
          (school, index) => `
            <button class="school-suggest-option${index === activeIndex ? " is-active" : ""}" type="button" data-school-index="${index}">
              <span class="school-suggest-name">${escapeHtml(school.name)}</span>
              <span class="school-suggest-meta">${escapeHtml(school.place)} · ${escapeHtml(school.type)}</span>
            </button>
          `
        )
        .join("");
      renderMatchCard(matches[0]);
    }

    input.setAttribute("autocomplete", "off");
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
        chooseSchool(matches[activeIndex]);
      } else if (event.key === "Escape") {
        list.hidden = true;
      }
    });

    list.addEventListener("mousedown", (event) => {
      const button = event.target.closest("[data-school-index]");
      if (!button) return;
      event.preventDefault();
      chooseSchool(matches[Number(button.dataset.schoolIndex)]);
    });

    document.addEventListener("click", (event) => {
      if (!shell.contains(event.target)) list.hidden = true;
    });

    const current = findSchool(input.value || document.querySelector("#profilePreviewSchool")?.textContent || "");
    if (current) renderMatchCard(current);
  }

  setupAutocomplete();
  document.querySelector("#openProfilePageButton")?.addEventListener("click", () => setTimeout(setupAutocomplete, 80));
  let tries = 0;
  const timer = setInterval(() => {
    setupAutocomplete();
    tries += 1;
    if (tries > 20) clearInterval(timer);
  }, 250);
})();

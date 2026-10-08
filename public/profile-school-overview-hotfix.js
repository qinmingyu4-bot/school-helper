(() => {
  const VERSION = "20261008-profile-school-overview-1.0.84";
  if (window.__studybridgeProfileSchoolOverviewVersion === VERSION) return;
  window.__studybridgeProfileSchoolOverviewVersion = VERSION;

  const schools = [
    {
      keys: ["university of toronto", "uoft", "u of t", "多伦多大学"],
      name: "University of Toronto",
      type: "Public research university",
      ranking: "QS 2026: #29",
      location: "Toronto, Ontario, Canada",
      features: ["加拿大顶尖研究型大学", "St. George 市中心资源强", "适合科研、商科、CS、生命科学等方向"],
      note: "排名为 QS 2026 参考值。具体申请、专业和课程要求请以学校官网为准。"
    },
    {
      keys: ["centennial college", "centennial", "百年理工"],
      name: "Centennial College",
      type: "Public college",
      ranking: "应用型学院，QS 不按综合大学排名展示",
      location: "Toronto, Ontario, Canada",
      features: ["课程偏就业和实践", "适合 business、engineering technology、health、media 等方向", "多伦多本地实习和行业资源较多"],
      note: "学院类学校通常更看重项目、实习和职业路径，具体课程以官网为准。"
    },
    {
      keys: ["university of british columbia", "ubc", "英属哥伦比亚大学"],
      name: "University of British Columbia",
      type: "Public research university",
      ranking: "QS 2026: #40",
      location: "Vancouver / Okanagan, British Columbia, Canada",
      features: ["加拿大顶尖研究型大学", "环境科学、商科、CS、工程等方向强", "国际化程度高"],
      note: "排名为 QS 2026 参考值。具体项目要求请以学校官网为准。"
    },
    {
      keys: ["university of waterloo", "waterloo", "滑铁卢大学"],
      name: "University of Waterloo",
      type: "Public research university",
      ranking: "QS 2026: #119",
      location: "Waterloo, Ontario, Canada",
      features: ["Co-op 实习体系非常有名", "CS、engineering、math、finance 相关方向强", "课程节奏通常比较紧"],
      note: "排名为 QS 2026 参考值。Co-op 和专业要求请以学校官网为准。"
    },
    {
      keys: ["mcgill university", "mcgill", "麦吉尔大学"],
      name: "McGill University",
      type: "Public research university",
      ranking: "QS 2026: #27",
      location: "Montreal, Quebec, Canada",
      features: ["加拿大顶尖研究型大学", "医学、生命科学、管理、工程等方向强", "英语授课环境，位于法语城市"],
      note: "排名为 QS 2026 参考值。课程和语言要求请以学校官网为准。"
    },
    {
      keys: ["new york university", "nyu", "纽约大学"],
      name: "New York University",
      type: "Private research university",
      ranking: "QS 2026: #43",
      location: "New York City, New York, USA",
      features: ["城市型校园资源丰富", "business、arts、social sciences、CS 等方向活跃", "适合重视城市机会和实习资源的学生"],
      note: "排名为 QS 2026 参考值。学费、项目和申请要求请以学校官网为准。"
    },
    {
      keys: ["ucla", "university of california los angeles", "加州大学洛杉矶"],
      name: "UCLA",
      type: "Public research university",
      ranking: "QS 2026: #42",
      location: "Los Angeles, California, USA",
      features: ["美国顶尖公立研究型大学", "STEM、film、business/economics、life sciences 等方向强", "校园资源和校友网络强"],
      note: "排名为 QS 2026 参考值。具体申请和课程要求请以学校官网为准。"
    }
  ];

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findSchool(name) {
    const key = normalize(name);
    if (!key) return null;
    return schools.find((school) => school.keys.some((item) => key.includes(item) || item.includes(key))) || {
      name,
      type: "School profile",
      ranking: "QS: 请以官网最新数据为准",
      location: "地点信息待补充",
      features: ["StudyBridge 会把这所学校写入 AI 学习上下文", "回答会优先贴近你的学校、课程语境和学习需求", "后续可以继续补充院系、专业、课程代码来提高客制化程度"],
      note: "这是通用学校卡片。具体申请、专业和课程要求请以学校官网为准。"
    };
  }

  function readSchoolFromProfilePage() {
    const input = document.querySelector("#sbProfileForm input[name='school']");
    if (input?.value) return input.value;
    const previewText = document.querySelector("#sbDirectPage .sb-card p.sb-muted")?.textContent || "";
    return previewText.split("·")[0]?.trim() || "";
  }

  function buildOverview(info) {
    return `
      <section class="sb-school-overview" data-profile-school-overview="true">
        <h3>${esc(info.name)} 概览</h3>
        <div class="sb-school-facts">
          <div><span>类型 / 排名</span><strong>${esc(info.type)}</strong><em>${esc(info.ranking)}</em></div>
          <div><span>地点</span><strong>${esc(info.location)}</strong></div>
        </div>
        <ul>${info.features.map((feature) => `<li>${esc(feature)}</li>`).join("")}</ul>
        <p>${esc(info.note)}</p>
      </section>
    `;
  }

  function installStyle() {
    if (document.querySelector("#profileSchoolOverviewStyle")) return;
    const style = document.createElement("style");
    style.id = "profileSchoolOverviewStyle";
    style.textContent = `
      .sb-school-overview { margin-top:18px; padding:14px; border:1px solid #d7e0ec; border-radius:8px; background:#f8fbfd; }
      .sb-school-overview h3 { margin:0 0 10px; font-size:16px; color:#0b2344; }
      .sb-school-facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:10px; }
      .sb-school-facts div { min-height:72px; padding:10px; border:1px solid #d7e0ec; border-radius:8px; background:#fff; }
      .sb-school-facts span { display:block; color:#52617a; font-size:12px; font-weight:800; }
      .sb-school-facts strong { display:block; margin-top:4px; color:#0b2344; line-height:1.25; }
      .sb-school-facts em { display:block; margin-top:3px; color:#0b2344; font-style:normal; font-weight:850; }
      .sb-school-overview ul { margin:10px 0; padding-left:18px; color:#0b2344; }
      .sb-school-overview li { margin:6px 0; }
      .sb-school-overview p { margin:10px 0 0; color:#52617a; font-size:12px; line-height:1.5; }
      @media (max-width: 760px) { .sb-school-facts { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }

  function applyOverview() {
    const profilePage = document.querySelector("#sbDirectPage:not([hidden])");
    if (!profilePage) return;
    const title = profilePage.querySelector(".sb-page-head h2")?.textContent || "";
    if (!/个人资料|Profile/i.test(title)) return;
    const firstCard = profilePage.querySelector(".sb-body .sb-card");
    if (!firstCard) return;
    const old = firstCard.querySelector("[data-profile-school-overview]");
    if (old) old.remove();
    const school = readSchoolFromProfilePage();
    const info = findSchool(school);
    if (!info) return;
    firstCard.insertAdjacentHTML("beforeend", buildOverview(info));
  }

  function init() {
    installStyle();
    applyOverview();
    const observer = new MutationObserver(() => window.requestAnimationFrame(applyOverview));
    observer.observe(document.body, { childList:true, subtree:true });
    document.addEventListener("input", (event) => {
      if (event.target?.matches?.("#sbProfileForm input[name='school']")) window.requestAnimationFrame(applyOverview);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();

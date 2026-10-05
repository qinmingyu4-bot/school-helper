(() => {
  const usSchools = [
    ["Harvard University", "Private research university", "Cambridge, Massachusetts, USA", "Ivy League research university with strong humanities, sciences, law, medicine, business, and public policy resources."],
    ["Stanford University", "Private research university", "Stanford, California, USA", "Strong in engineering, computer science, entrepreneurship, business, medicine, and interdisciplinary research."],
    ["Massachusetts Institute of Technology", "Private research university", "Cambridge, Massachusetts, USA", "Known for engineering, computer science, economics, physical sciences, labs, projects, and problem-set-heavy courses."],
    ["California Institute of Technology", "Private research university", "Pasadena, California, USA", "Small research university with intense STEM, physics, engineering, math, and research-focused learning."],
    ["Princeton University", "Private research university", "Princeton, New Jersey, USA", "Ivy League university with strong undergraduate teaching, research, humanities, social sciences, engineering, and public policy."],
    ["Yale University", "Private research university", "New Haven, Connecticut, USA", "Ivy League university known for humanities, social sciences, law, arts, research writing, and seminar-style learning."],
    ["Columbia University", "Private research university", "New York City, New York, USA", "Ivy League urban campus with strong journalism, business, engineering, sciences, humanities, and NYC resources."],
    ["University of Pennsylvania", "Private research university", "Philadelphia, Pennsylvania, USA", "Ivy League university known for business, economics, medicine, social sciences, engineering, and interdisciplinary study."],
    ["Cornell University", "Private research university", "Ithaca, New York, USA", "Ivy League university with strong engineering, agriculture, hotel administration, sciences, business, and broad research fields."],
    ["Brown University", "Private research university", "Providence, Rhode Island, USA", "Ivy League university known for open curriculum, humanities, social sciences, sciences, and independent learning."],
    ["Dartmouth College", "Private research university", "Hanover, New Hampshire, USA", "Ivy League college with strong undergraduate focus, liberal arts, business network, and close faculty interaction."],
    ["Duke University", "Private research university", "Durham, North Carolina, USA", "Strong in medicine, public policy, engineering, business, data, and interdisciplinary undergraduate research."],
    ["Northwestern University", "Private research university", "Evanston / Chicago, Illinois, USA", "Known for journalism, communication, business, engineering, performing arts, and quarter-system pace."],
    ["University of Chicago", "Private research university", "Chicago, Illinois, USA", "Known for economics, social sciences, humanities, rigorous theory, research writing, and seminar discussion."],
    ["Johns Hopkins University", "Private research university", "Baltimore, Maryland, USA", "Strong in medicine, public health, biomedical engineering, international studies, and research-intensive coursework."],
    ["Carnegie Mellon University", "Private research university", "Pittsburgh, Pennsylvania, USA", "Strong in computer science, engineering, robotics, AI, design, business analytics, and project-based technical work."],
    ["Vanderbilt University", "Private research university", "Nashville, Tennessee, USA", "Strong in education, medicine, engineering, humanities, social sciences, and collaborative undergraduate learning."],
    ["Rice University", "Private research university", "Houston, Texas, USA", "Small research university with strong engineering, natural sciences, architecture, music, and close academic community."],
    ["Washington University in St. Louis", "Private research university", "St. Louis, Missouri, USA", "Known for pre-med, business, design, social sciences, engineering, and strong student support."],
    ["Emory University", "Private research university", "Atlanta, Georgia, USA", "Strong in public health, business, medicine, social sciences, humanities, and Atlanta professional networks."],
    ["Georgetown University", "Private research university", "Washington, DC, USA", "Known for international relations, public policy, business, law, humanities, and government-adjacent learning."],
    ["New York University", "Private research university", "New York City, New York, USA", "Urban campus with strong business, arts, media, social sciences, data, and global campus network."],
    ["University of Southern California", "Private research university", "Los Angeles, California, USA", "Strong in film, media, business, engineering, communication, games, and LA industry connections."],
    ["Northeastern University", "Private research university", "Boston, Massachusetts, USA", "Known for co-op, experiential learning, engineering, business, computer science, and career-focused planning."],
    ["Boston University", "Private research university", "Boston, Massachusetts, USA", "Urban research university with strong communications, business, health sciences, engineering, and international community."],
    ["Boston College", "Private research university", "Chestnut Hill, Massachusetts, USA", "Strong in liberal arts, business, education, nursing, theology, and writing-heavy coursework."],
    ["Tufts University", "Private research university", "Medford / Somerville, Massachusetts, USA", "Known for international relations, engineering, sciences, humanities, pre-med, and interdisciplinary study."],
    ["University of Notre Dame", "Private research university", "Notre Dame, Indiana, USA", "Strong undergraduate community, business, engineering, humanities, architecture, and writing-intensive courses."],
    ["University of California, Berkeley", "Public research university", "Berkeley, California, USA", "Flagship public research university strong in CS, engineering, economics, sciences, social sciences, and rigorous courses."],
    ["University of California, Los Angeles", "Public research university", "Los Angeles, California, USA", "Large public research university strong in life sciences, engineering, film, social sciences, and discussion-section courses."],
    ["University of California, San Diego", "Public research university", "San Diego, California, USA", "Strong in biology, engineering, data science, oceanography, cognitive science, and research labs."],
    ["University of California, Davis", "Public research university", "Davis, California, USA", "Strong in agriculture, veterinary medicine, biology, environmental science, engineering, and applied research."],
    ["University of California, Irvine", "Public research university", "Irvine, California, USA", "Strong in computer science, engineering, health sciences, business, and Southern California career networks."],
    ["University of California, Santa Barbara", "Public research university", "Santa Barbara, California, USA", "Strong in physics, materials, engineering, environmental studies, social sciences, and research culture."],
    ["University of California, Santa Cruz", "Public research university", "Santa Cruz, California, USA", "Known for computer science, game design, astronomy, environmental studies, and interdisciplinary learning."],
    ["University of California, Riverside", "Public research university", "Riverside, California, USA", "Public research university with strengths in engineering, business, natural sciences, and diverse student support."],
    ["University of California, Merced", "Public research university", "Merced, California, USA", "Growing UC campus with strengths in engineering, natural sciences, sustainability, and undergraduate research access."],
    ["University of Michigan", "Public research university", "Ann Arbor, Michigan, USA", "Large public research university strong in engineering, business, public policy, medicine, social sciences, and campus resources."],
    ["University of Virginia", "Public research university", "Charlottesville, Virginia, USA", "Strong in liberal arts, business, public policy, engineering, and writing-heavy undergraduate courses."],
    ["University of North Carolina at Chapel Hill", "Public research university", "Chapel Hill, North Carolina, USA", "Strong in public health, business, journalism, sciences, humanities, and undergraduate research."],
    ["University of Florida", "Public research university", "Gainesville, Florida, USA", "Large public research university strong in engineering, business, health, agriculture, and online/hybrid learning support."],
    ["Georgia Institute of Technology", "Public research university", "Atlanta, Georgia, USA", "Top engineering and technology-focused public university with strong CS, robotics, analytics, and project work."],
    ["University of Texas at Austin", "Public research university", "Austin, Texas, USA", "Large flagship university strong in engineering, CS, business, communications, public affairs, and Austin tech links."],
    ["Texas A&M University", "Public research university", "College Station, Texas, USA", "Large public university strong in engineering, agriculture, business, sciences, and structured campus culture."],
    ["University of Washington", "Public research university", "Seattle, Washington, USA", "Strong in CS, engineering, medicine, data, life sciences, and Seattle tech ecosystem connections."],
    ["University of Wisconsin-Madison", "Public research university", "Madison, Wisconsin, USA", "Flagship research university strong in engineering, business, agriculture, social sciences, and research writing."],
    ["University of Illinois Urbana-Champaign", "Public research university", "Urbana / Champaign, Illinois, USA", "Strong in engineering, computer science, business, agriculture, and technical project-based courses."],
    ["Purdue University", "Public research university", "West Lafayette, Indiana, USA", "Known for engineering, aviation, computer science, technology, agriculture, and problem-solving coursework."],
    ["Ohio State University", "Public research university", "Columbus, Ohio, USA", "Large flagship university strong in business, engineering, health sciences, agriculture, and broad course offerings."],
    ["Pennsylvania State University", "Public research university", "University Park, Pennsylvania, USA", "Large public university strong in engineering, business, communications, earth sciences, and alumni network."],
    ["University of Maryland, College Park", "Public research university", "College Park, Maryland, USA", "Strong in computer science, engineering, public policy, business, and DC-area opportunities."],
    ["University of Minnesota Twin Cities", "Public research university", "Minneapolis / St. Paul, Minnesota, USA", "Strong in engineering, health, agriculture, business, public affairs, and urban research opportunities."],
    ["Indiana University Bloomington", "Public research university", "Bloomington, Indiana, USA", "Known for business, music, informatics, public affairs, humanities, and large-campus learning."],
    ["Michigan State University", "Public research university", "East Lansing, Michigan, USA", "Strong in education, agriculture, business, communication, sciences, and applied research."],
    ["Arizona State University", "Public research university", "Tempe, Arizona, USA", "Large public university known for innovation, business, engineering, online learning, and interdisciplinary programs."],
    ["University of Arizona", "Public research university", "Tucson, Arizona, USA", "Strong in astronomy, optics, health sciences, business, engineering, and desert/environment research."],
    ["University of Colorado Boulder", "Public research university", "Boulder, Colorado, USA", "Strong in aerospace, environmental science, engineering, physics, business, and outdoor-oriented campus culture."],
    ["University of Pittsburgh", "Public research university", "Pittsburgh, Pennsylvania, USA", "Strong in health sciences, business, engineering, public policy, neuroscience, and urban research connections."],
    ["Rutgers University", "Public research university", "New Brunswick, New Jersey, USA", "Large public research university strong in business, engineering, sciences, pharmacy, humanities, and NYC/NJ networks."],
    ["University of Massachusetts Amherst", "Public research university", "Amherst, Massachusetts, USA", "Strong in computer science, engineering, business, food science, social sciences, and Five College resources."],
    ["Florida State University", "Public research university", "Tallahassee, Florida, USA", "Strong in business, criminology, public affairs, arts, sciences, and campus-based undergraduate learning."],
    ["University of Miami", "Private research university", "Coral Gables, Florida, USA", "Strong in marine science, business, communication, music, health, and Miami regional connections."],
    ["Syracuse University", "Private research university", "Syracuse, New York, USA", "Known for communications, architecture, public affairs, information studies, business, and project-based learning."],
    ["Rochester Institute of Technology", "Private university", "Rochester, New York, USA", "Career-focused university strong in computing, engineering, design, imaging science, and co-op education."],
    ["Drexel University", "Private research university", "Philadelphia, Pennsylvania, USA", "Known for co-op, engineering, business, computing, design, health sciences, and experiential learning."],
    ["Temple University", "Public research university", "Philadelphia, Pennsylvania, USA", "Urban public university strong in business, media, health, arts, law, and city-based learning."],
    ["Fordham University", "Private university", "New York City, New York, USA", "Jesuit university with strengths in business, liberal arts, law, communications, and NYC opportunities."],
    ["George Washington University", "Private research university", "Washington, DC, USA", "Urban DC university strong in international affairs, public policy, business, political science, and health."],
    ["American University", "Private university", "Washington, DC, USA", "Known for international service, public affairs, communications, political science, and DC policy environment."],
    ["San Diego State University", "Public university", "San Diego, California, USA", "Large public university strong in business, public health, engineering, communication, and applied learning."],
    ["California State University, Long Beach", "Public university", "Long Beach, California, USA", "Career-oriented public university with strengths in business, engineering, arts, education, and applied programs."],
    ["San Jose State University", "Public university", "San Jose, California, USA", "Located in Silicon Valley, strong in engineering, CS, business, design, and career-focused pathways."],
    ["University of Houston", "Public research university", "Houston, Texas, USA", "Urban public research university strong in business, engineering, hospitality, health, and energy-sector links."],
    ["CUNY Baruch College", "Public college", "New York City, New York, USA", "Known for business, accounting, finance, public affairs, and urban commuter-student learning."],
    ["CUNY Hunter College", "Public college", "New York City, New York, USA", "Strong in liberal arts, health sciences, education, social work, and urban public-college pathways."],
    ["Borough of Manhattan Community College", "Public community college", "New York City, New York, USA", "Community college focused on transfer pathways, applied associate programs, and commuter-friendly support."],
    ["Santa Monica College", "Public community college", "Santa Monica, California, USA", "Community college known for transfer pathways, arts/media proximity, and broad lower-division coursework."],
    ["De Anza College", "Public community college", "Cupertino, California, USA", "Community college in Silicon Valley with strong transfer pathways and applied STEM/business coursework."],
    ["Foothill College", "Public community college", "Los Altos Hills, California, USA", "Community college with transfer pathways, online options, STEM, health, and career-focused programs."],
    ["Diablo Valley College", "Public community college", "Pleasant Hill, California, USA", "Community college known for transfer pathways to UC/CSU and strong lower-division academic preparation."],
    ["Houston Community College", "Public community college", "Houston, Texas, USA", "Community college with transfer, workforce, ESL, business, health, and technology pathways."],
    ["Austin Community College", "Public community college", "Austin, Texas, USA", "Community college with transfer, workforce, technology, health, and flexible learning pathways."],
    ["Miami Dade College", "Public college", "Miami, Florida, USA", "Large public college with transfer, workforce, health, business, and diverse student support pathways."]
  ].map(([name, type, place, summary]) => ({ name, type, place, summary }));

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

  function search(query) {
    const q = normalize(query);
    if (!q) return [];
    return usSchools
      .map((school) => {
        const n = normalize(school.name);
        let score = 0;
        if (n === q) score = 100;
        else if (n.startsWith(q)) score = 85;
        else if (n.split(" ").some((part) => part.startsWith(q))) score = 70;
        else if (n.includes(q)) score = 45;
        return { school, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.school.name.localeCompare(b.school.name))
      .slice(0, 12)
      .map((item) => item.school);
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
      <ul class="school-traits"><li>${escapeHtml(school.summary)}</li><li>StudyBridge 会把这所学校和你的专业一起写入 AI 学习上下文。</li><li>回答会更贴近你的学校环境、课程语境和专业方向。</li></ul>
      <p class="school-insight-note">这是学校资料库中的概览。具体专业、课程、申请要求和排名请以学校官网为准。</p>
    `;
  }

  function addToDatalist() {
    let list = document.querySelector("#studybridgeSchoolDatalist");
    if (!list) {
      list = document.createElement("datalist");
      list.id = "studybridgeSchoolDatalist";
      document.body.appendChild(list);
    }
    const existing = new Set([...list.querySelectorAll("option")].map((option) => option.value));
    usSchools.forEach((school) => {
      if (existing.has(school.name)) return;
      const option = document.createElement("option");
      option.value = school.name;
      list.appendChild(option);
    });
  }

  function appendMatches(input) {
    const value = input.value.trim();
    const matches = search(value);
    const shell = input.closest(".school-field-shell");
    const list = shell?.querySelector(".school-suggest-list");
    if (!list || !value || !matches.length) return;

    list.hidden = false;
    list.querySelectorAll("[data-us-school]").forEach((item) => item.remove());
    const divider = document.createElement("div");
    divider.className = "school-suggest-empty";
    divider.dataset.usSchool = "label";
    divider.textContent = "美国学校库";
    list.appendChild(divider);

    matches.forEach((school, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "school-suggest-option";
      button.dataset.usSchool = String(index);
      button.innerHTML = `
        <span class="school-suggest-name">${escapeHtml(school.name)}</span>
        <span class="school-suggest-meta">${escapeHtml(school.place)} · ${escapeHtml(school.type)}</span>
      `;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        input.value = school.name;
        list.hidden = true;
        renderInsight(school);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      list.appendChild(button);
    });
  }

  function attach() {
    addToDatalist();
    document.querySelectorAll("#schoolInput, #onboardingSchoolInput").forEach((input) => {
      if (input.dataset.usSchoolLibraryReady === "true") return;
      input.dataset.usSchoolLibraryReady = "true";
      input.setAttribute("list", "studybridgeSchoolDatalist");
      input.addEventListener("input", () => setTimeout(() => appendMatches(input), 0));
      input.addEventListener("focus", () => setTimeout(() => appendMatches(input), 0));
      input.addEventListener("change", () => {
        const school = usSchools.find((item) => normalize(item.name) === normalize(input.value));
        if (school) renderInsight(school);
      });
    });
  }

  attach();
  setInterval(attach, 500);
})();

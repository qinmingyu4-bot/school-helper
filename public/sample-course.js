(function () {
  "use strict";

  const { materials, questions, quiz } = window.StudyBridgeSampleContent;
  const ui = window.StudyBridgeI18n;
  const root = document.querySelector("#sample-app");
  const dialog = document.querySelector("#sample-source-dialog");
  const themeButton = document.querySelector("#sample-theme");
  const stages = [
    ["read", "读资料", "Read"],
    ["ask", "问一问", "Ask"],
    ["practice", "做练习", "Practice"]
  ];
  const storeKey = "studybridge.sample-course.elasticity.v1";
  const colorScheme = matchMedia("(prefers-color-scheme: dark)");
  let activeCitation;
  let opener;
  let returnStage;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storeKey)) || {}; } catch { /* Optional browser storage. */ }
  const state = {
    stage: stages.some(([id]) => id === saved.stage) ? saved.stage : "read",
    material: Object.hasOwn(materials, saved.material) ? saved.material : "lecture",
    asked: Array.isArray(saved.asked) ? [...new Set(saved.asked.filter(index => Number.isInteger(index) && questions[index]))] : [],
    choices: quiz.map((item, index) => Number.isInteger(saved.choices?.[index]) && item.choices[saved.choices[index]] ? saved.choices[index] : null),
    submitted: false,
    review: Number.isFinite(saved.review) && saved.review > 0 && saved.review <= 8.64e15 ? saved.review : null,
    theme: ["light", "dark"].includes(saved.theme) ? saved.theme : null
  };
  state.submitted = saved.submitted === true && state.choices.every(choice => choice !== null);
  if (!state.submitted) state.review = null;

  const english = () => ui.getLanguage() === "en";
  const say = (zh, en) => english() ? en : zh;
  const copy = (pair) => say(...pair);

  function persist() {
    try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch { /* Everything still works during this visit. */ }
  }

  function button(label, action, options = {}) {
    const { value, style = "", extra = "" } = options;
    return `<button type="button" class="sample-button ${style}" data-action="${action}" ${value === undefined ? "" : `data-value="${value}"`} ${extra}>${label}</button>`;
  }

  function sourceButton(material, index) {
    return button(
      `<span aria-hidden="true">↗</span> ${copy(materials[material].title)} · ${say(`第 ${index + 1} 节`, `§ ${index + 1}`)}`,
      "source", { value: `${material}:${index}`, style: "sample-citation" }
    );
  }

  function caseTable() {
    return `<table class="sample-table">
      <thead><tr><th scope="col">${say("日均数据", "Daily average")}</th><th scope="col">${say("提价前", "Before")}</th><th scope="col">${say("提价后", "After")}</th></tr></thead>
      <tbody><tr><th scope="row">${say("每杯价格", "Price per cup")}</th><td>$5</td><td>$6</td></tr>
      <tr><th scope="row">${say("销量", "Cups sold")}</th><td>100</td><td>80</td></tr></tbody>
    </table>`;
  }

  function passage(section) {
    return `<p lang="en" class="sample-original">${section.original}</p>
      ${english() ? "" : `<p class="sample-translation">${section.translation}</p>`}
      ${section.formula ? `<p lang="en" class="sample-formula">${section.formula}</p>` : ""}
      ${section.table ? caseTable() : ""}`;
  }

  function reading() {
    const material = materials[state.material];
    const next = state.material === "lecture"
      ? button(say("读校园咖啡店案例 →", "Read the café case →"), "material", { value: "case", style: "sample-primary" })
      : button(say("去问第一个问题 →", "Ask your first question →"), "stage", { value: "ask", style: "sample-primary" });
    return `<div class="sample-section-head"><div><h2 id="sample-stage-title" tabindex="-1">${say("课程资料", "Course materials")}</h2>
      <p>${say("先认识需求弹性，再用咖啡店的数据试着解释一次。", "Learn what elasticity means, then apply it to a café’s sales.")}</p></div></div>
      <div class="sample-material-picker" role="group" aria-label="${say("选择资料", "Select material")}">
        ${Object.keys(materials).map(id => button(copy(materials[id].title), "material", { value: id, extra: `aria-pressed="${id === state.material}"` })).join("")}
      </div>
      <article class="sample-paper" aria-labelledby="sample-paper-title">
        <header><p lang="en" class="sample-label">${material.original}</p><h3 id="sample-paper-title" tabindex="-1">${copy(material.title)}</h3></header>
        ${material.sections.map((section, index) => `<section class="sample-passage" id="sample-passage-${index}" tabindex="-1">
          <h4><span aria-hidden="true">${index + 1}.</span> ${copy(section.title)}</h4>${passage(section)}
        </section>`).join("")}
      </article>
      <div class="sample-actions">${returnStage
        ? button(returnStage === "ask" ? say("← 返回答疑", "← Back to Q&A") : say("← 返回练习", "← Back to practice"),
          "stage", { value: returnStage, style: "sample-primary" })
        : next}</div>`;
  }

  function asking() {
    const answer = (index) => {
      const item = questions[index];
      return `<article class="sample-exchange" aria-labelledby="sample-answer-${index}">
        <div class="sample-question"><h3 id="sample-answer-${index}" tabindex="-1">${copy(item.prompt)}</h3><span>${say("提问", "Question")}</span></div>
        <div class="sample-response"><p class="sample-label">${say("示例回答", "Sample answer")}</p>
        ${item.blocks.map(block => `<div class="sample-answer-block">
          <p>${copy(block.text)}</p>
          <div class="sample-sources">${block.sources.map(([id, section]) => sourceButton(id, section)).join("")}</div>
        </div>`).join("")}</div>
      </article>`;
    };
    return `<div class="sample-section-head"><div><h2 id="sample-stage-title" tabindex="-1">${say("课程答疑", "Course Q&A")}</h2>
      <p>${say("选一个预设问题，点回答下方的出处，就能对照原文。", "Choose a sample question and open its citations to check the original text.")}</p></div></div>
      <div class="sample-question-list" role="group" aria-label="${say("示例问题", "Sample questions")}">
        ${questions.map((item, index) => button(`<span>${copy(item.prompt)}</span><span aria-hidden="true">${state.asked.includes(index) ? "✓" : "↗"}</span>`, "ask", { value: index })).join("")}
      </div>
      ${state.asked.map(answer).join("")}
      <div class="sample-actions">${button(say("做三道练习 →", "Try three practice questions →"), "stage", { value: "practice", style: "sample-primary" })}</div>`;
  }

  function practiceForm() {
    return `<form id="sample-quiz">
      ${quiz.map((item, index) => `<fieldset class="sample-quiz-item">
        <legend><span aria-hidden="true">${index + 1}.</span> ${copy(item.prompt)}</legend>
        <div class="sample-options">${item.choices.map((choice, n) => `<label>
          <input type="radio" name="q-${index}" value="${n}" ${state.choices[index] === n ? "checked" : ""} required>
          <span>${copy(choice)}</span>
        </label>`).join("")}</div>
        <details class="sample-hint"><summary>${say("看提示", "Show hint")}</summary><p>${copy(item.hint)}</p></details>
      </fieldset>`).join("")}
      <div class="sample-actions"><button class="sample-button sample-primary" type="submit">${say("提交并查看反馈 →", "Submit and see feedback →")}</button></div>
    </form>`;
  }

  function feedback() {
    const missed = quiz.filter((item, index) => item.correct !== state.choices[index]);
    const score = quiz.length - missed.length;
    const reviewDate = state.review
      ? new Intl.DateTimeFormat(ui.locale(), { dateStyle: "long" }).format(state.review)
      : "";
    return `<section class="sample-results" aria-labelledby="sample-results-title">
      <h3 id="sample-results-title" tabindex="-1">${say(`答对 ${score} / ${quiz.length} 题`, `${score} of ${quiz.length} correct`)}</h3>
      <p>${missed.length
        ? say(`建议复习：${missed.map(item => copy(item.topic)).join("、")}。`, `Review: ${missed.map(item => copy(item.topic).toLowerCase()).join(", ")}.`)
        : say("三题都答对了。明天可以再做一遍，看看还记得多少。", "You got all three right. Try them again tomorrow to see what you remember.")}</p>
    </section>
    <ol class="sample-feedback-list">${quiz.map((item, index) => {
      const chosen = state.choices[index];
      return `<li>
        <div class="sample-feedback-title"><h3>${copy(item.topic)}</h3>
        <span class="${chosen === item.correct ? "sample-correct" : "sample-missed"}">${chosen === item.correct ? say("回答正确", "Correct") : say("建议复习", "Review this")}</span></div>
        <p class="sample-choice-summary">${say("你的选择：", "Your answer: ")}${copy(item.choices[chosen])}
        ${chosen === item.correct ? "" : `<br>${say("正确答案：", "Correct answer: ")}${copy(item.choices[item.correct])}`}</p>
        <p>${copy(item.feedback[chosen])}</p>
        ${sourceButton(...item.source)}
      </li>`;
    }).join("")}</ol>
    <div class="sample-actions">
      ${state.review ? button(say("取消复习标记", "Remove review date"), "review", { style: "sample-subtle" })
        : button(say("标记明天复习", "Mark for review tomorrow"), "review")}
      ${button(say("再练一次", "Try again"), "retry", { style: "sample-subtle" })}
      <a class="sample-button sample-primary" href="/app?page=study">${say("进入自己的学习空间 ↗", "Open your own study space ↗")}</a>
    </div>
    <p id="sample-review-status" class="sample-review-status" role="status" tabindex="-1">${reviewDate
      ? say(`复习日期：${reviewDate}。保存在本浏览器，可随时回来再练。`, `Review date: ${reviewDate}. Saved in this browser so you can return and practise again.`)
      : say("复习标记只记录日期，保存在本浏览器。", "A review date is saved in this browser.")}</p>`;
  }

  function practising() {
    return `<div class="sample-section-head"><div><h2 id="sample-stage-title" tabindex="-1">${say("课后练习", "Practice")}</h2>
      <p>${say("用三道题检查你是否读懂了讲义和案例。", "Three questions check your understanding of the notes and case.")}</p></div></div>
      ${state.submitted ? feedback() : practiceForm()}`;
  }

  function render() {
    document.title = say("示例课 · StudyBridge", "Sample course · StudyBridge");
    document.querySelector("#sample-language-label").textContent = say("界面语言", "Interface language");
    const current = stages.findIndex(([id]) => id === state.stage);
    root.innerHTML = `<div class="sample-overview">
      <div class="sample-path"><a href="/#usage-demo">${say("首页", "Home")}</a><span aria-hidden="true">/</span><span>${say("免登录示例课", "Guest sample course")}</span></div>
      <h1>${say("需求弹性与咖啡价格", "Demand elasticity and the price of coffee")}</h1>
      <p>${say("一杯咖啡卖贵了，店家的收入为什么反而下降？", "A café charges more for a cup. Why does it bring in less money?")}</p>
      <div class="sample-meta"><span>${say("微观经济学", "Microeconomics")}</span><span>${say("约 5 分钟", "About 5 min")}</span></div>
    </div>
    <div class="sample-layout">
      <aside class="sample-sidebar">
        <nav class="sample-steps" aria-label="${say("学习步骤", "Course steps")}">
          <p class="sample-side-heading">${say("学习步骤", "Course steps")}</p>
          ${stages.map(([id, zh, en], index) => button(
            `<span class="sample-step-number" aria-hidden="true">${index + 1}</span><span>${say(zh, en)}</span>`,
            "stage", { value: id, extra: index === current ? 'aria-current="step"' : "" }
          )).join("")}
        </nav>
        <p class="sample-side-note">${say("本课使用原创示例资料。答疑为预设示例，练习进度保存在此浏览器。", "Original sample materials, prepared answers, and practice progress saved in this browser.")}</p>
      </aside>
      <section class="sample-workspace" aria-labelledby="sample-stage-title">
        ${state.stage === "read" ? reading() : state.stage === "ask" ? asking() : practising()}
      </section>
    </div>
    <footer class="sample-footer"><a href="/#usage-demo">${say("← 返回首页", "← Back to home")}</a></footer>`;
  }

  function moveFocus(selector) {
    const node = document.querySelector(selector);
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  }

  function update(selector) {
    persist();
    render();
    moveFocus(selector);
  }

  function renderCitation() {
    const [id, index] = activeCitation.split(":");
    const material = materials[id];
    const section = material.sections[index];
    dialog.innerHTML = `<header class="sample-dialog-head"><div>
      <p class="sample-label">${copy(material.title)} · ${say(`第 ${Number(index) + 1} 节`, `§ ${Number(index) + 1}`)}</p>
      <h2 id="sample-source-title">${copy(section.title)}</h2></div>
      <form method="dialog"><button class="sample-button sample-close" type="submit" aria-label="${say("关闭出处", "Close citation")}" autofocus>×</button></form>
    </header>
    <div class="sample-dialog-body">${passage(section)}</div>
    <div class="sample-dialog-actions">${button(say("在课程资料中打开 →", "Open in course materials →"), "open-material", { value: activeCitation })}</div>`;
  }

  function applyTheme() {
    const dark = state.theme ? state.theme === "dark" : colorScheme.matches;
    if (dark) document.documentElement.dataset.sbMode = "dark";
    else delete document.documentElement.dataset.sbMode;
    themeButton.textContent = dark ? "☀" : "☾";
    const label = dark ? say("切换浅色模式", "Use light mode") : say("切换深色模式", "Use dark mode");
    themeButton.setAttribute("aria-label", label);
    themeButton.title = label;
  }

  themeButton.addEventListener("click", () => {
    state.theme = document.documentElement.dataset.sbMode === "dark" ? "light" : "dark";
    persist();
    applyTheme();
  });
  colorScheme.addEventListener("change", applyTheme);
  ui.subscribe(() => {
    const focus = document.activeElement;
    const action = focus?.dataset.action;
    const value = focus?.dataset.value;
    render();
    if (action && !dialog.open) {
      const target = [...root.querySelectorAll("[data-action]")].find(node => node.dataset.action === action && node.dataset.value === value);
      target?.focus({ preventScroll: true });
    }
    if (dialog.open) {
      renderCitation();
      dialog.querySelector(".sample-close").focus();
    }
    applyTheme();
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || !(root.contains(target) || dialog.contains(target))) return;
    const { action, value } = target.dataset;
    switch (action) {
      case "stage":
        if (state.stage !== value) {
          state.stage = value;
          returnStage = undefined;
          update("#sample-stage-title");
        }
        break;
      case "material":
        state.material = value;
        update("#sample-paper-title");
        break;
      case "ask": {
        const index = Number(value);
        if (!state.asked.includes(index)) {
          state.asked.push(index);
          update(`#sample-answer-${index}`);
        } else moveFocus(`#sample-answer-${index}`);
        break;
      }
      case "source":
        opener = target;
        activeCitation = value;
        renderCitation();
        dialog.showModal();
        break;
      case "open-material": {
        const [id, index] = value.split(":");
        opener = undefined;
        dialog.close();
        returnStage = state.stage;
        state.stage = "read";
        state.material = id;
        update(`#sample-passage-${index}`);
        break;
      }
      case "retry":
        state.choices = quiz.map(() => null);
        state.submitted = false;
        state.review = null;
        update("#sample-stage-title");
        break;
      case "review": {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        state.review = state.review ? null : tomorrow.getTime();
        update("#sample-review-status");
        break;
      }
    }
  });

  dialog.addEventListener("close", () => {
    opener?.focus({ preventScroll: true });
    opener = undefined;
  });

  root.addEventListener("change", (event) => {
    if (!event.target.matches("#sample-quiz input[type=radio]")) return;
    state.choices[Number(event.target.name.slice(2))] = Number(event.target.value);
    persist();
  });

  root.addEventListener("submit", (event) => {
    if (event.target.id !== "sample-quiz") return;
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    const answers = new FormData(event.target);
    state.choices = quiz.map((_, index) => Number(answers.get(`q-${index}`)));
    state.submitted = true;
    update("#sample-results-title");
  });

  applyTheme();
  render();
})();

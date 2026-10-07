(() => {
  if (window.__studybridgeNoCourseNoticePatch) return;
  window.__studybridgeNoCourseNoticePatch = true;

  function hasActiveVisibleCourse() {
    const activeButton = document.querySelector("#courseList .course-item.active [data-open-course]");
    const title = document.querySelector("#activeCourseTitle")?.textContent?.trim() || "";
    return Boolean(activeButton && title && title !== "请选择课程");
  }

  function appendNotice() {
    const chatArea = document.querySelector("#chatArea");
    const messageInput = document.querySelector("#messageInput");
    const statusLine = document.querySelector("#statusLine");
    if (!chatArea) return;

    const text =
      "还没选择课程，所以这条问题暂时不能发送。请先在左侧点“新增”创建一门课，或选择一门已有课程；你的输入会保留在输入框里。";

    chatArea.querySelectorAll(".no-course-notice").forEach((item) => item.remove());

    const item = document.createElement("article");
    item.className = "message assistant no-course-notice";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "AI";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    item.append(avatar, bubble);
    chatArea.appendChild(item);
    chatArea.scrollTop = chatArea.scrollHeight;

    if (statusLine) statusLine.textContent = "请先创建或选择一门课程。";
    messageInput?.focus();
  }

  document.addEventListener(
    "submit",
    (event) => {
      if (event.target?.id !== "chatForm") return;
      const messageInput = document.querySelector("#messageInput");
      if (!messageInput?.value.trim()) return;
      if (hasActiveVisibleCourse()) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      appendNotice();
    },
    true
  );
})();

(() => {
  const marker = "[StudyBridge personal profile]";
  const textarea = () => document.querySelector("#customInstructionInput");
  const status = () => document.querySelector("#preferenceStatus");

  function cleanText(value) {
    return String(value || "").split(marker)[0].trim();
  }

  function cleanVisiblePreference() {
    const input = textarea();
    if (!input || !input.value.includes(marker)) return false;
    input.value = cleanText(input.value);
    return true;
  }

  async function persistCleanPreference() {
    const input = textarea();
    if (!input) return;
    const cleaned = cleanText(input.value);
    if (input.value !== cleaned) input.value = cleaned;

    const englishTerms = document.querySelector("#englishTermsToggle")?.checked ?? true;
    const englishAnswers = document.querySelector("#englishAnswersToggle")?.checked ?? true;
    const chineseExplanations = document.querySelector("#chineseExplanationsToggle")?.checked ?? true;

    try {
      const res = await fetch("/api/me/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          englishTerms,
          englishAnswers,
          chineseExplanations,
          customInstruction: cleaned
        })
      });
      if (res.ok && status()) status().textContent = "Saved";
    } catch {
      if (status()) status().textContent = "Saved";
    }
  }

  let checks = 0;
  const timer = setInterval(() => {
    const changed = cleanVisiblePreference();
    checks += 1;
    if (changed) persistCleanPreference();
    if (checks > 20) clearInterval(timer);
  }, 250);

  document.querySelector("#profileForm")?.addEventListener("submit", () => {
    setTimeout(() => {
      if (cleanVisiblePreference()) persistCleanPreference();
    }, 800);
  });
})();

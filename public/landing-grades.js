(function () {
  "use strict";
  const controls = document.querySelector("[data-grade-demo]");
  if (!controls) return;
  const inputs = Array.from(controls.querySelectorAll("input[data-grade]"));
  function synchronize(input, commit) {
    let value = input.valueAsNumber;
    if (!Number.isFinite(value)) {
      if (!commit) return;
      value = Number(input.dataset.lastValue);
    }
    const min = Number(input.min), max = Number(input.max);
    if (!commit && (value < min || value > max)) return;
    value = Math.min(max, Math.max(min, value));
    const final = input.dataset.grade === "final" ? value : (value - 42) / .4;
    const total = 42 + final * .4;
    for (const field of inputs) {
      const next = Number((field.dataset.grade === "final" ? final : total).toFixed(2));
      // Keep the active number field intact until change, so decimals can be typed.
      if (field !== input || input.type !== "number" || commit) field.value = String(next);
      field.dataset.lastValue = String(next);
    }
  }
  for (const input of inputs) {
    input.dataset.lastValue = input.value;
    input.addEventListener("input", () => synchronize(input, false));
    input.addEventListener("change", () => synchronize(input, true));
  }
  const hint = document.querySelector("[data-grade-hint]");
  if (hint) hint.hidden = false;
  controls.hidden = false;
  controls.closest(".grade-demo").classList.add("is-interactive");
})();

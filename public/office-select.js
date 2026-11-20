/* Keep native select values/change handlers; render a consistent rounded popup. */
(function () {
  'use strict';
  let active, sequence = 0, search = '', searchAt = 0;
  const targetSelect = target => target?.closest?.('.office-shell select:not([multiple])');
  function close(restoreFocus = false) {
    if (!active) return;
    const { select, menu, expanded, controls } = active;
    active = null;
    menu.remove();
    for (const [name, value] of [['aria-expanded', expanded], ['aria-controls', controls]]) {
      if (value === null) select.removeAttribute(name); else select.setAttribute(name, value);
    }
    if (restoreFocus && select.isConnected) select.focus({ preventScroll: true });
  }
  function highlight(index) {
    if (!active || !active.buttons.length) return;
    active.index = Math.max(0, Math.min(active.buttons.length - 1, index));
    active.buttons.forEach((button, i) => button.classList.toggle('is-current', i === active.index));
    const button = active.buttons[active.index];
    active.menu.setAttribute('aria-activedescendant', button.id);
    button.scrollIntoView({ block: 'nearest' });
  }
  function choose(index) {
    if (!active) return;
    const { select, buttons } = active, optionIndex = Number(buttons[index]?.dataset.optionIndex);
    if (!Number.isInteger(optionIndex) || select.options[optionIndex]?.disabled) return;
    const changed = select.selectedIndex !== optionIndex;
    select.selectedIndex = optionIndex;
    close(true);
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function open(select) {
    if (select.disabled || select.size > 1 || active?.select === select) return;
    close(); search = ''; searchAt = 0;
    const menu = document.createElement('div');
    menu.className = 'office-select-menu';
    menu.id = `office-select-menu-${++sequence}`;
    menu.setAttribute('role', 'listbox');
    menu.tabIndex = -1;
    const label = select.getAttribute('aria-label') || [...(select.labels?.[0]?.childNodes || [])]
      .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
    if (label) menu.setAttribute('aria-label', label);
    const buttons = [];
    for (const [index, option] of [...select.options].entries()) {
      if (option.hidden) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.tabIndex = -1;
      button.id = `${menu.id}-${index}`;
      button.dataset.optionIndex = String(index);
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.selected));
      button.disabled = option.disabled || (option.parentElement?.tagName === 'OPTGROUP' && option.parentElement.disabled);
      button.textContent = option.textContent;
      menu.append(button);
      if (!button.disabled) buttons.push(button);
    }
    if (!buttons.length) return;
    active = { select, menu, buttons, index: 0, expanded: select.getAttribute('aria-expanded'), controls: select.getAttribute('aria-controls') };
    select.setAttribute('aria-expanded', 'true'); select.setAttribute('aria-controls', menu.id);
    document.body.append(menu);
    const rect = select.getBoundingClientRect(), viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
    menu.style.minWidth = `${Math.min(rect.width, width - 16)}px`;
    menu.style.maxWidth = `${Math.min(360, width - 16)}px`;
    menu.style.maxHeight = `${Math.min(280, height - 16)}px`;
    const below = top + height - rect.bottom - 8, above = rect.top - top - 8;
    const upward = below < menu.offsetHeight + 6 && above > below;
    menu.style.maxHeight = `${Math.max(32, Math.min(280, upward ? above - 6 : below - 6))}px`;
    menu.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${upward ? Math.max(top + 8, rect.top - menu.offsetHeight - 6) : Math.max(top + 8, rect.bottom + 6)}px`;
    menu.addEventListener('pointermove', event => {
      const index = buttons.indexOf(event.target.closest('button'));
      if (index >= 0 && active?.menu === menu) highlight(index);
    });
    menu.addEventListener('click', event => {
      const index = buttons.indexOf(event.target.closest('button'));
      if (index >= 0 && active?.menu === menu) choose(index);
    });
    menu.focus({ preventScroll: true });
    highlight(Math.max(0, buttons.findIndex(button => Number(button.dataset.optionIndex) === select.selectedIndex)));
  }
  document.addEventListener('pointerdown', event => {
    const select = targetSelect(event.target);
    if (select && event.button === 0) { event.preventDefault(); open(select); }
    else if (active && !active.menu.contains(event.target)) close();
  }, true);
  document.addEventListener('mousedown', event => {
    if (targetSelect(event.target) || active?.menu.contains(event.target)) event.preventDefault();
  }, true);
  document.addEventListener('click', event => {
    const select = targetSelect(event.target);
    if (select) { event.preventDefault(); open(select); }
  }, true);
  document.addEventListener('keydown', event => {
    if (!active) {
      const select = targetSelect(event.target);
      if (select && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); open(select); }
      return;
    }
    if (!active.menu.contains(event.target) && event.target !== active.select) { close(); return; }
    const { index, buttons } = active;
    if (event.key === 'Tab') { close(true); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(index); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      highlight(event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now(); search = now - searchAt > 700 ? event.key : search + event.key; searchAt = now;
      const match = buttons.findIndex(button => button.textContent.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));
      if (match >= 0) highlight(match);
    }
  }, true);
  window.addEventListener('resize', () => close());
  window.visualViewport?.addEventListener('resize', () => close());
  document.addEventListener('scroll', event => { if (active && !active.menu.contains(event.target)) close(); }, true);
  new MutationObserver(() => { if (active && !active.select.isConnected) close(); }).observe(document.body, { childList: true, subtree: true });
})();

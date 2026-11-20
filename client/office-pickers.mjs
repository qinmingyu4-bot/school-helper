// Keep native selects as the value/display source, with consistent toggle behavior.
export function bindDocPickers(host, signal) {
  let active;
  const close = () => {
    if (!active) return;
    active.menu.hidden = true;
    active.trigger.setAttribute("aria-expanded", "false");
    active = null;
  };
  host.querySelectorAll('.office-toolbar select[data-setting], .office-page-settings select[data-setting]').forEach(select => {
    const label = select.parentElement;
    const name = label.firstChild.textContent.trim();
    const wrap = document.createElement('span');
    wrap.className = 'office-picker';
    select.before(wrap);
    wrap.append(select);
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = `office-picker-trigger-${select.dataset.setting}`;
    label.htmlFor = trigger.id;
    trigger.className = 'office-picker-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('span');
    menu.className = 'office-picker-menu';
    menu.id = `office-picker-${select.dataset.setting}`;
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', name);
    trigger.setAttribute('aria-controls', menu.id);
    const options = Array.from(select.options, option => {
      const item = document.createElement('button');
      item.type = 'button';
      item.tabIndex = -1;
      item.textContent = option.textContent;
      item.setAttribute('role', 'option');
      item.addEventListener('click', event => {
        event.preventDefault();
        select.value = option.value;
        close();
        trigger.focus({ preventScroll: true });
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
      });
      menu.append(item);
      return item;
    });
    const refresh = () => {
      trigger.setAttribute('aria-label', `${name}: ${select.selectedOptions[0]?.textContent || ''}`);
      options.forEach((item, i) => item.setAttribute('aria-selected', String(i === select.selectedIndex)));
    };
    // Called after editor selection changes update the underlying select value.
    select.refreshPicker = refresh;
    const open = () => {
      close();
      refresh();
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      active = { wrap, menu, trigger };
      menu.scrollTop = options[Math.max(0, select.selectedIndex)]?.offsetTop || 0;
    };
    trigger.addEventListener('click', event => {
      event.preventDefault();
      trigger.focus({ preventScroll: true });
      if (active?.trigger === trigger) close();
      else open();
    });
    wrap.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        trigger.focus({ preventScroll: true });
      } else if (event.key === 'Tab') close();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const index = options.indexOf(document.activeElement);
        if (active?.trigger !== trigger) open();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index < 0 ? Math.max(0, select.selectedIndex) : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      }
    });
    wrap.append(trigger, menu);
    refresh();
  });
  document.addEventListener('pointerdown', event => {
    if (active && !active.wrap.contains(event.target)) close();
  }, { signal });
  document.addEventListener('focusin', event => {
    if (active && !active.wrap.contains(event.target)) close();
  }, { signal });
  signal.addEventListener('abort', close, { once: true });
}

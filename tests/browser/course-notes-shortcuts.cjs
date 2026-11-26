const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.NOTES_PLAYWRIGHT_MODULE || 'playwright');
const { blankPdf } = require('../../lib/course-notes');

async function checkCompactPreview(browser) {
  const preview = path.resolve(__dirname, '../../previews/StudyBridge_Compact_Notes.html');
  for (const [width, height, touch] of [[1280, 800, false], [1024, 768, true], [390, 844, true]]) {
    const page = await browser.newPage({ viewport: {width, height}, hasTouch: touch });
    try {
      await page.route('https://notes.test/layout', route => route.fulfill({path: preview, contentType:'text/html'}));
      await page.goto('https://notes.test/layout');
      const selector = page.locator('#layout');
      const measure = page.locator('#measure');
      await page.waitForFunction(() => /\d+ px/.test(document.getElementById('measure').textContent));
      const geometry = () => page.locator('.note-scroll').evaluate(el => ({
        top: el.getBoundingClientRect().top,
        visible: Math.min(innerHeight, el.getBoundingClientRect().bottom) - el.getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth - innerWidth
      }));
      const count = await page.locator('[data-sticky]').count();
      const compact = await geometry();
      const compactLabel = await measure.innerText();
      assert.equal(compact.overflow, 0);
      const bottomGap = await page.locator('.note-scroll').evaluate(el =>
        document.body.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom);
      assert.ok(bottomGap >= 0 && bottomGap <= (width <= 700 ? 8 : 12), 'Only a small inset should follow the paper');
      assert.ok(await page.locator('[data-mode=pen]').evaluate(el => el.offsetHeight >= (matchMedia('(pointer:coarse)').matches ? 44 : 36)));
      for (const control of ['new-blank','pdf','save','focus']) assert.ok(await page.locator('[data-note="'+control+'"]').isVisible());
      await selector.selectOption('original');
      const original = await geometry();
      assert.ok(original.top - compact.top >= 20, 'Tool area should release at least 20 px');
      assert.ok(compact.visible > original.visible, 'More paper should be visible');
      await selector.selectOption('compact');
      assert.equal(await page.locator('[data-sticky]').count(), count);
      assert.equal(await measure.innerText(), compactLabel);
      console.log(width + 'x' + height + ': compact controls/paper gain ' + Math.round(original.top-compact.top) + '/' + Math.round(compact.visible-original.visible) + ' px');
    } finally {
      await page.close();
    }
  }
}

async function checkNotesViewports(browser) {
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '../..');
  const comparison = fs.readFileSync(path.join(root, 'previews/StudyBridge_Compact_Notes.html'), 'utf8');
  const html = require('../../scripts/desktop-notes-preview.cjs').buildDesktopPreview(root, comparison);
  for (const [name, width, height, touch] of [
    ['desktop', 1440, 900, false], ['tablet', 1180, 820, true], ['phone', 390, 844, true],
    ['split', 768, 1024, true]
  ]) {
    const page = await browser.newPage({ viewport: {width, height}, hasTouch: touch, isMobile: touch });
    try {
      await page.setContent(html);
      const sticky = page.locator('.note-ink [data-sticky]');
      await sticky.first().waitFor();
      await page.waitForFunction(() => document.querySelector('[data-mode=sticky]').getAttribute('aria-pressed') === 'true');
      await page.evaluate(() => document.fonts.ready);
      const paper = page.locator('.note-scroll');
      const rect = await paper.boundingBox();
      assert.ok(rect.width > width * .44 && rect.height >= height * .32, name + ' needs a usable writing area');
      const menu = page.locator('.note-menu-trigger');
      if (name === 'tablet' || name === 'split') {
        const bounds = await page.locator('.note-sheet').boundingBox();
        assert.ok(Math.abs(bounds.width / bounds.height - 297/210) < .003);
        assert.ok(bounds.y >= rect.y);
        if (name === 'tablet') {
          assert.ok(bounds.x - rect.x <= 8 && rect.x + rect.width - bounds.x - bounds.width <= 24,
            'Landscape A4 must fill the viewport width at default zoom');
          await paper.evaluate(el => { el.scrollTop = el.scrollHeight; });
          const bottom = await page.locator('.note-sheet').boundingBox();
          assert.ok(Math.abs(rect.y + rect.height - bottom.y - bottom.height) <= 9, 'Page bottom must be reachable');
          await paper.evaluate(el => { el.scrollTop = 0; });
        } else {
          assert.ok(bounds.y + bounds.height <= rect.y + rect.height + 1);
        }
        assert.ok(bounds.x >= rect.x && bounds.x + bounds.width <= rect.x + rect.width + 1);
        console.log(name + ' visible workspace ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + ', A4 ' + Math.round(bounds.width) + 'x' + Math.round(bounds.height));
      }
      if (name === 'tablet') {
        const sidebar = page.locator('.app-shell > .sidebar');
        assert.equal(await sidebar.isVisible(), false);
        assert.ok(rect.width >= width * .90);
        for (let i=0; i<3; i++) await page.locator('[data-note=zoom-in]').click();
        const paperNode = await paper.elementHandle();
        await paper.evaluate(el => { el.scrollTop = 100; });
        await menu.tap();
        const links = sidebar.locator('.side-nav [data-page]');
        assert.ok(await links.count() >= 6 && await links.first().isVisible());
        await page.keyboard.press('Escape');
        await sidebar.waitFor({state:'hidden'});
        await menu.tap();
        await sidebar.locator('.note-menu-close').tap();
        await sidebar.waitFor({state:'hidden'});
        await menu.tap();
        await page.mouse.click(width-20, 24);
        await sidebar.waitFor({state:'hidden'});
        assert.ok(await paperNode.evaluate(el => el.isConnected && el.scrollTop >= 99));
        await menu.tap();
        await page.setViewportSize({width:800,height:1000});
        await page.waitForFunction(() => !document.querySelector('.sidebar[popover]'));
        await page.setViewportSize({width,height});
        await menu.waitFor();
        assert.equal(await sidebar.isVisible(),false);
        for (let i=0; i<3; i++) await page.locator('[data-note=zoom-out]').click();
        await paper.evaluate(el => { el.scrollTop = 0; });
      } else {
        assert.equal(await menu.count(), 0);
      }
      if (width > 900 && !touch) {
        const side = await page.locator('.app-shell > .sidebar').boundingBox();
        assert.ok(side.width >= 150 && rect.x >= side.x + side.width - 1);
      }
      if (process.env.NOTES_SCREENSHOT_DIR && name !== 'split') {
        fs.mkdirSync(process.env.NOTES_SCREENSHOT_DIR, {recursive:true});
        await page.screenshot({path:path.join(process.env.NOTES_SCREENSHOT_DIR, name+'.png')});
      }
      if (touch) {
        if (name === 'split') {
          for (let i=0; i<6; i++) await page.locator('[data-note=zoom-in]').click();
        }
        const geometry = () => page.evaluate(() => {
          const outer = document.querySelector('.workspace'), paper = document.querySelector('.note-scroll');
          return { inner:paper.scrollTop, outer:outer.scrollTop, root:scrollY,
            extra:Math.max(outer.scrollHeight-outer.clientHeight, document.documentElement.scrollHeight-innerHeight),
            gap:innerHeight-paper.getBoundingClientRect().bottom };
        });
        const before = await geometry();
        assert.ok(before.extra <= 2 && before.gap >= -1 && before.gap <= 16, name + ' bounds ' + JSON.stringify(before));
        await page.locator('[data-mode=hand]').tap();
        const devtools = await page.context().newCDPSession(page);
        const area = await paper.boundingBox();
        const x = Math.round(area.x + area.width*.06), y = Math.round(area.y + Math.min(80, area.height*.35));
        await devtools.send('Input.synthesizeScrollGesture', {
          x, y, yDistance:-100, speed:450, gestureSourceType:'touch', preventFling:true
        });
        // Some desktop Chrome hosts complete synthetic gestures without sending
        // touch moves. Exercise the same finger swipe with explicit input samples.
        if ((await geometry()).inner <= 10) {
          const send = (type, dy) => devtools.send('Input.dispatchTouchEvent', {
            type, touchPoints:type === 'touchEnd' ? [] : [{x, y:y+dy, id:1}]
          });
          await send('touchStart', 0);
          for (let dy=-12; dy>=-72; dy-=12) {
            await send('touchMove', dy);
            await page.waitForTimeout(25);
          }
          await send('touchEnd', -72);
        }
        await page.waitForFunction(() => document.querySelector('.note-scroll').scrollTop > 10, null, {timeout:5000});
        const after = await geometry();
        assert.equal(after.root, before.root);
        assert.equal(after.outer, before.outer);
        await paper.evaluate(el => { el.scrollTop = 0; });
      }
      await page.locator('[data-mode=hand]').click();
      await sticky.first().click();
      await page.keyboard.press('Backspace');
      assert.equal(await sticky.count(), 1);
    } finally { await page.close(); }
  }
}

async function run() {
  const browser = await chromium.launch({channel:'chrome', args:['--window-size=1600,1200']});
  try {
    await checkNotesViewports(browser);
    await checkCompactPreview(browser);
    const page = await browser.newPage();
    const pdf = await blankPdf();
    const publicDir = path.resolve(__dirname, '../../public');
    const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
    const redo = primary === 'Meta' ? 'Meta+Shift+z' : 'Control+y';
    await page.route('https://notes.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') return route.fulfill({contentType:'text/html',body:
        '<section id="courseNotesSlot" style="width:680px"></section><link rel="stylesheet" href="/course-notes.css"><script src="/course-notes-model.js"></script><script src="/course-notes.js"></script>'});
      if (pathname.startsWith('/api/')) return route.fulfill({contentType:'application/pdf',body:pdf});
      await route.fulfill({path:path.join(publicDir, pathname), ...(pathname.endsWith('.mjs') ? {contentType:'text/javascript'} : {})});
    });
    await page.goto('https://notes.test');
    await page.evaluate(() => {
      window.StudyBridgeI18n = {getLanguage:()=>'en'};
      window.saved = [];
      return window.StudyBridgeCourseNotes.mount({userId:'fixture',courseId:'demo',courses:[{id:'demo',name:'Demo'}],
        async api(url, opts) {
          if (opts?.method === 'PUT') { window.saved.push(opts.body.items); return {version:window.saved.length}; }
          if (opts?.method === 'POST') return {document:{id:'blank',title:'Blank'}};
          return {documents:[]};
        }});
    });
    await page.locator('[data-note=new-blank]').click();
    await page.locator('[data-mode=sticky]').click();
    const canvas = page.locator('svg.note-ink');
    await canvas.click({position:{x:80,y:100}});
    const count = n => page.waitForFunction(n => document.querySelectorAll('svg.note-ink [data-sticky]').length === n, n);
    const selected = page.locator('[data-sticky-control]');
    const press = keys => page.keyboard.press(keys);
    await count(1);
    await press('Enter');
    const input = page.locator('[data-text-dialog] textarea');
    await input.fill('Class note!');
    await press('Backspace');
    assert.equal(await input.inputValue(),'Class note');
    await page.locator('[data-text-dialog] [value=save]').click();
    await page.locator('[data-mode=hand]').click();
    assert.ok(await canvas.evaluate(el => el === document.activeElement));
    await press(primary+'+s');
    await page.waitForFunction(() => window.saved.at(-1)?.[0]?.text === 'Class note');
    await press(primary+'+c');
    await press(primary+'+v'); await count(2);
    assert.equal(await page.locator('svg.note-ink [data-sticky]').last().textContent(),'Class note');
    await press(primary+'+x'); await count(1);
    await press(primary+'+v'); await count(2);
    await press(primary+'+d'); await count(3);
    await press('Escape'); await selected.waitFor({state:'detached'});
    await press('Delete'); await count(3);
    await page.locator('svg.note-ink [data-sticky]').last().click();
    await press('Backspace'); await count(2);
    await press(primary+'+z'); await count(3);
    await press(redo); await count(2);
    await press(primary+'+z'); await count(3);
    await press(primary+'+Shift+z'); await count(2);
    await page.locator('svg.note-ink [data-sticky]').last().click();
    await press('Delete'); await count(1);
    await page.locator('[data-note=undo]').click();
    await count(2);
    await press(redo); await count(1);
    const picker = page.locator('[data-picker-toggle=course]');
    await picker.focus();
    await press('End');
    assert.ok(await page.locator('[data-note=add-course]').evaluate(el => el === document.activeElement));
    await press('Home');
    await press('Escape');
    assert.ok(await picker.evaluate(el => el === document.activeElement));
    console.log(process.platform + ' Chrome passed clipboard, duplication, text editing, deletion, undo, redo, save and Escape.');
  } finally { await browser.close(); }
}
run().catch(error => {console.error(error);process.exitCode=1;});

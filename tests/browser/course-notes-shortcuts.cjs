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

async function checkDesktopShell(browser) {
  const root = path.resolve(__dirname, '../..');
  const source = require('node:fs').readFileSync(path.join(root, 'previews/StudyBridge_Compact_Notes.html'), 'utf8');
  const html = require('../../scripts/desktop-notes-preview.cjs').buildDesktopPreview(root, source);
  const page = await browser.newPage({viewport:{width:1440, height:900}});
  try {
    await page.setContent(html);
    const sticky = page.locator('.note-ink [data-sticky]');
    await sticky.first().waitFor();
    const sidebar = await page.locator('.app-shell > .sidebar').boundingBox();
    const paper = await page.locator('.note-scroll').boundingBox();
    assert.ok(sidebar.width > 150 && paper.x >= sidebar.x + sidebar.width - 1);
    assert.ok(paper.width > 600 && paper.y < 550, 'Desktop should show the sidebar and writing area together');
    assert.ok(await page.locator('.tools-tabs [data-tool=notes]').isVisible());
    await sticky.first().click();
    await page.keyboard.press('Backspace');
    assert.equal(await sticky.count(), 1);
  } finally {
    await page.close();
  }
}

async function run() {
  const browser = await chromium.launch({channel:'chrome'});
  try {
    await checkDesktopShell(browser);
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

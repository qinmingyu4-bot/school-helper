const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function buildDesktopPreview(root, comparison) {
  const dir = path.join(root, 'public');
  const read = file => fs.readFileSync(path.join(dir, file), 'utf8');
  const app = read('app.js');
  // Evaluate the same template functions that render the logged-in tools route.
  const functions = ['sidebarHtml', 'navButton', 'classmateUnreadDot', 'shellHtml', 'pageHeader',
    'profileAvatarHtml', 'toolsPage', 'toolsWorkspaceHtml'].map(name => {
    const begin = app.indexOf('  function ' + name + '(');
    const end = app.indexOf('\n  }', begin);
    if (begin < 0 || end < 0) throw new Error('Missing site template: ' + name);
    return app.slice(begin, end + 4);
  });
  const constant = (begin, end) => app.slice(app.indexOf(begin), app.indexOf(end,app.indexOf(begin)) + end.length);
  const ui = require(path.join(dir, 'i18n'));
  const scope = {StudyBridgeI18n:ui};
  vm.runInNewContext(read('storage-quota.js'), {window:scope});
  const state = {page:'tools', mode:'student', tool:'notes', user:{id:'sample', name:'预览用户', email:'demo@example.test', membershipTier:'plus'}};
  const usageView = require(path.join(dir,'ai-usage')).create({doc:{addEventListener(){}}});
  usageView.stop();
  const shell = vm.runInNewContext([
    constant('const pageLabels = {', '\n  };'), constant('const navIconPaths =', '\n  });'),
    constant('const brandMarkHtml =', '</span>`;'), ...functions, 'shellHtml(toolsPage())'
  ].join('\n'), {
    ui, state, esc:value=>String(value ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])),
    initials:name=>name[0], profile:()=>({school:'示例课程'}), profileSbId:()=>'Demo', isAdmin:()=>true,
    nextDue:()=>null, canManageInvites:()=>true, classmateNotifications:{hasUnread:()=>false},
    officeTools:{supports:()=>false}, creativeTools:{videoEnabled:()=>false},
    usageView,
    storageView:scope.StudyBridgeStorage.create({})
  }).replace('data-storage-summary>查看','data-storage-summary>0 MiB / 1 GiB').replace('data-usage-summary></span>','data-usage-summary>剩余 75%</span>');

  const mime = {'.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml','.png':'image/png'};
  const embed = file => 'data:' + mime[path.extname(file)] + ';base64,' + fs.readFileSync(file).toString('base64');
  const styles = [...read('index.html').matchAll(/<link rel="stylesheet" href="\/([^"?]+)(?:\?[^"]*)?"/g)].map(([,name]) => {
    // The notes workspace doesn't render mathematical markup or need its web fonts.
    if (name.includes('katex.min.css')) return '';
    const css = read(name);
    return css.replace(/url\(\s*(["']?)([^)'"]+)\1\s*\)/g,(src, quote, url) => {
      if (/^(data:|#)/.test(url)) return src;
      const [asset,fragment] = url.split('#');
      const file = path.resolve(dir, asset.startsWith('/') ? asset.slice(1) : path.join(path.dirname(name),asset));
      return mime[path.extname(file)] && fs.existsSync(file) ? 'url("' + embed(file) + (fragment ? '#'+fragment : '') + '")' : src;
    });
  }).join('\n');
  let editor = comparison.slice(comparison.indexOf('<script>window.StudyBridgeI18n'));
  // Fix the demonstration document dimensions at open, just like its saved PDF.
  editor = editor.replace('window.previewBlankPaper=', "const tabletPaper=matchMedia('(pointer: coarse) and (min-width: 701px) and (min-height: 600px)').matches;window.previewBlankPaper=")
    .replace('width:700*scale,height:1200*scale', 'width:(tabletPaper?841.89:700)*scale,height:(tabletPaper?595.28:1200)*scale');
  const fixtureEditor = read('course-notes.js')
    .replace("  'use strict';", "  'use strict';\n  const localStorage = {getItem:()=>null, setItem(){}, removeItem(){}};")
    .replace("await import('/vendor/pdfjs/pdf.min.mjs')", "window.previewBlankPaper")
    .replaceAll('已保存到云端', '本地示例');
  editor = editor.replace(/<script>\(function \(\) \{[\s\S]*?<\/script>/, () => '<script>'+fixtureEditor+'</script>');
  const begin = editor.indexOf("    const layout = document.getElementById('layout');");
  const end = editor.indexOf('    setLayout();\n',begin);
  if(begin < 0 || end < 0) throw new Error('Preview setup changed');
  editor = editor.slice(0,begin) + editor.slice(end+'    setLayout();\n'.length);
  editor = editor.replace("document.getElementById('measure').textContent", "document.getElementById('courseNotesSlot').textContent");
  const content = shell.replace('class="app-shell"', 'class="app-shell" data-mobile-view="page" data-mobile-panel="closed"').replace(/src="\/(brand\/[^"]+)"/g,(_,file)=>'src="'+embed(path.join(dir,file))+'"');
  return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>课堂笔记 · StudyBridge 桌面预览</title><style>'+styles+'</style><body><div id="root">'+content+'</div><script>document.addEventListener("click",e=>{if(!e.target.closest(".note-menu-trigger,.note-menu-close") && e.target.closest(".sidebar, .tools-tabs, .page-header") && e.target.closest("button,summary,select")){e.preventDefault();const status=document.querySelector(".course-notes [role=status]");if(status)status.textContent="本地桌面预览仅开放课堂笔记。";}},true);</script>'+editor;
}
module.exports = {buildDesktopPreview};

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const comparison = fs.readFileSync(path.join(root, 'previews/StudyBridge_Compact_Notes.html'), 'utf8');
  if (!process.argv[2]) throw new Error('Provide an output HTML path.');
  fs.writeFileSync(process.argv[2], buildDesktopPreview(root, comparison));
}

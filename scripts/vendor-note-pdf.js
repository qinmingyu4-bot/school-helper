// Reuse the installed, pinned PDF library; loaded only when exporting notes.
const fs=require('node:fs');
const path=require('node:path');
const source=path.dirname(require.resolve('pdf-lib/package.json'));
const destination=path.join(__dirname,'../public/vendor/note-pdf');
fs.mkdirSync(destination,{recursive:true});
fs.copyFileSync(path.join(source,'dist/pdf-lib.esm.min.js'),path.join(destination,'pdf-lib.mjs'));
fs.copyFileSync(path.join(source,'LICENSE.md'),path.join(destination,'LICENSE.md'));
console.log('Vendored pdf-lib '+require('pdf-lib/package.json').version+' for annotated PDF export.');

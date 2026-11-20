import {PDFDocument,degrees} from './vendor/note-pdf/pdf-lib.mjs';

async function overlay(items,viewport) {
  const scale=Math.min(2,2400/viewport.width,2400/viewport.height);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(viewport.width*scale));
  canvas.height=Math.max(1,Math.round(viewport.height*scale));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 1000 ${1000*viewport.height/viewport.width}">${window.StudyBridgeNoteModel.markup(items,viewport.height/viewport.width)}</svg>`;
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try {
    const image=new Image();image.src=url;await image.decode();
    canvas.getContext('2d').drawImage(image,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw Error('Could not render annotations.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {URL.revokeObjectURL(url);canvas.width=canvas.height=0;}
}

export async function exportPdf({source,pages,check,progress}) {
  check();
  await document.fonts.ready;
  const output=await PDFDocument.load(await source.getData());
  if(output.getPageCount()!==source.numPages)throw Error('PDF page count mismatch.');
  const annotated=pages.filter(p=>p.items.length);
  for(let i=0;i<annotated.length;i++) {
    check();
    const entry=annotated[i];
    if(!Number.isInteger(entry.page)||entry.page<1||entry.page>source.numPages)throw Error('Invalid annotation page.');
    progress(i+1,annotated.length);
    const page=await source.getPage(entry.page),viewport=page.getViewport({scale:1});
    const png=await overlay(entry.items,viewport);
    check();
    const image=await output.embedPng(png),{angle,...position}=window.StudyBridgeNoteModel.placement(viewport);
    output.getPage(entry.page-1).drawImage(image,{...position,rotate:degrees(angle)});
    // Yield between pages so the cancel control and tablet UI remain responsive.
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  check();
  const bytes=await output.save({updateFieldAppearances:false});
  check();
  return bytes;
}

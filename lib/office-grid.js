const M = require('../public/office-model');
const clone = v => JSON.parse(JSON.stringify(v));
function rewriteReferences(formula, sheetName, target, axis, operation, index, count) {
  if (!formula.startsWith('=')) return formula;
  const shift = n => operation === 'insert' ? n >= index ? n + count : n : n < index ? n : n >= index + count ? n - count : null;
  // Quoted string literals are never interpreted as cell references.
  return formula.split(/("(?:[^"]|"")*")/g).map((part,i)=>i%2?part:part.replace(/(?<![A-Za-z0-9_.'!])(?:(('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_. ]*)!))?(\$?[A-Z]{1,3}\$?[1-9]\d*)(?::(\$?[A-Z]{1,3}\$?[1-9]\d*))?(?![A-Za-z0-9_(])/gi,(match,prefix,qualified,first,last)=>{
    const named=qualified ? qualified.startsWith("'") ? qualified.slice(1,-1).replace(/''/g,"'") : qualified : sheetName;
    if(named.toLowerCase()!==target.toLowerCase())return match;
    const decode = text => {const m=/(\$?)([A-Z]+)(\$?)(\d+)/i.exec(text);return {col:M.address(m[2].toUpperCase()+m[4])?.col,row:Number(m[4]),ca:m[1],ra:m[3]};};
    const a=decode(first),b=last?decode(last):null;if(!a.col||b&&!b.col)return match;
    const key=axis==='row'?'row':'col',oldA=a[key],oldB=b?.[key];
    a[key]=shift(oldA);if(b)b[key]=shift(oldB);
    if(operation==='delete'&&b){const low=Math.min(oldA,oldB),high=Math.max(oldA,oldB);const first=low<index?low:low>=index+count?low-count:index;const last=high>=index+count?high-count:high<index?high:index-1;if(first>last)return '#REF!';a[key]=oldA<=oldB?first:last;b[key]=oldA<=oldB?last:first;}
    const valid=p=>p.row>=1&&p.row<=1000&&p.col>=1&&p.col<=100;
    if(!valid(a)||b&&!valid(b))return '#REF!';
    const encode=p=>p.ca+M.col(p.col)+p.ra+p.row;
    return (prefix||'')+encode(a)+(b?':'+encode(b):'');
  }).replace(/(?<![A-Za-z0-9_.'!])(?:(('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_. ]*)!))?(\$?[A-Z]{1,3}):(\$?[A-Z]{1,3})(?![A-Za-z0-9_])/gi,(match,prefix,qualified,a,b)=>whole(match,prefix,qualified,a,b,'col'))
    .replace(/(?<![A-Za-z0-9_.'!])(?:(('(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_. ]*)!))?(\$?[1-9]\d*):(\$?[1-9]\d*)(?![A-Za-z0-9_])/gi,(match,prefix,qualified,a,b)=>whole(match,prefix,qualified,a,b,'row'))).join('');
  function whole(match,prefix,qualified,a,b,type) {
    const named=qualified?qualified.startsWith("'")?qualified.slice(1,-1).replace(/''/g,"'"):qualified:sheetName;
    if(type!==axis||named.toLowerCase()!==target.toLowerCase())return match;
    const number=v=>type==='row'?Number(v.replace('$','')):M.address(v.replace('$','').toUpperCase()+'1')?.col;
    const oldA=number(a),oldB=number(b);if(!oldA||!oldB)return match;
    let first=shift(oldA),last=shift(oldB);
    if(operation==='delete'){const lo=Math.min(oldA,oldB),hi=Math.max(oldA,oldB),low=lo<index?lo:lo>=index+count?lo-count:index,high=hi>=index+count?hi-count:hi<index?hi:index-1;if(low>high)return '#REF!';first=oldA<=oldB?low:high;last=oldA<=oldB?high:low;}
    if(first<1||last<1||Math.max(first,last)>(type==='row'?1000:100))return '#REF!';
    const format=(original,n)=>(original.startsWith('$')?'$':'')+(type==='row'?n:M.col(n));
    return (prefix||'')+format(a,first)+':'+format(b,last);
  }
}
function changeAxis(model,sheetIndex,axis,operation,index,count=1) {
  const result=clone(model),sheet=result.sheets[sheetIndex],key=axis==='row'?'rows':'cols',max=axis==='row'?1000:100,min=axis==='row'?10:5;
  if(!sheet||!['row','col'].includes(axis)||!['insert','delete'].includes(operation)||!Number.isInteger(index)||index<1||index>sheet[key]||!Number.isInteger(count)||count<1)throw Error('无效的行列操作。');
  const next=sheet[key]+(operation==='insert'?count:-count);
  if(next>max||next<min)throw Error(axis==='row'?'工作表需要 10–1000 行。':'工作表需要 5–100 列。');
  if(operation==='delete'&&index+count-1>sheet[key])throw Error('删除范围超出工作表。');
  const moved={};
  for(const [address,cell]of Object.entries(sheet.cells)){const p=M.address(address),n=p[axis];if(operation==='delete'&&n>=index&&n<index+count)continue;p[axis]=n>=index?n+(operation==='insert'?count:-count):n;moved[M.col(p.col)+p.row]=cell;}
  sheet.cells=moved;sheet[key]=next;
  const sizes=axis==='row'?'rowHeights':'columnWidths';
  if(sheet[sizes]){const adjusted={};for(const [number,size]of Object.entries(sheet[sizes])){const n=Number(number);if(operation==='delete'&&n>=index&&n<index+count)continue;adjusted[n>=index?n+(operation==='insert'?count:-count):n]=size;}sheet[sizes]=adjusted;}
  for(const s of result.sheets)for(const cell of Object.values(s.cells))cell.value=rewriteReferences(cell.value,s.name,sheet.name,axis,operation,index,count);
  return M.normalize('sheets',result);
}
function parseGrid(text) {
  if(text.length>2000000)throw Error('粘贴内容过大。');
  const rows=[[]];let value='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'&&(quoted||!value)){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c==='\t'||c==='\n'||c==='\r')){rows.at(-1).push(value);value='';if(c!=='\t'){if(c==='\r'&&text[i+1]==='\n')i++;rows.push([]);}}
    else value+=c;
  }
  rows.at(-1).push(value);if(rows.length>1&&rows.at(-1).length===1&&rows.at(-1)[0]==='')rows.pop();
  if(quoted||rows.length>1000||rows.some(r=>r.length>100||r.some(v=>v.length>4000)))throw Error('粘贴内容超过工作表限制。');
  return rows;
}
function shiftCopy(formula,dr,dc) {
  if(!formula.startsWith('='))return formula;
  const whole=(match,prefix,a,b,type)=>{
    const shift=value=>{const absolute=value.startsWith('$'),raw=value.replace('$','');const old=type==='col'?M.address(raw.toUpperCase()+'1')?.col:Number(raw);if(!old)return null;const next=old+(absolute?0:type==='col'?dc:dr);if(next<1||next>(type==='col'?100:1000))return null;return (absolute?'$':'')+(type==='col'?M.col(next):next);};
    const first=shift(a),last=shift(b);return first===null||last===null?'#REF!':(prefix||'')+first+':'+last;
  };
  return formula.split(/("(?:[^"]|"")*")/g).map((part,i)=>i%2?part:part.replace(/(?<![A-Za-z0-9_])(?:(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?\$?[A-Z]{1,3}\$?[1-9]\d*(?![A-Za-z0-9_(])/gi,match=>match.replace(/(\$?)([A-Z]+)(\$?)(\d+)$/i,(ref,ca,col,ra,row)=>{const p=M.address(col.toUpperCase()+row);if(!p)return ref;const r=p.row+(ra?0:dr),c=p.col+(ca?0:dc);return r<1||r>1000||c<1||c>100?'#REF!':ca+M.col(c)+ra+r;}))
    .replace(/(?<![A-Za-z0-9_.'!])((?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?[A-Z]{1,3}):(\$?[A-Z]{1,3})(?![A-Za-z0-9_])/gi,(m,p,a,b)=>whole(m,p,a,b,'col'))
    .replace(/(?<![A-Za-z0-9_.'!])((?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(\$?[1-9]\d*):(\$?[1-9]\d*)(?![A-Za-z0-9_])/gi,(m,p,a,b)=>whole(m,p,a,b,'row'))).join('');
}
function pasteGrid(model,sheetIndex,start,text,clipboard) {
  const rows=parseGrid(text),at=M.address(start),result=clone(model),sheet=result.sheets[sheetIndex];
  if(!at||at.row+rows.length-1>1000||at.col+Math.max(...rows.map(r=>r.length))-1>100)throw Error('粘贴范围超过 1000 行或 100 列。');
  sheet.rows=Math.max(sheet.rows,at.row+rows.length-1);sheet.cols=Math.max(sheet.cols,at.col+Math.max(...rows.map(r=>r.length))-1);
  rows.forEach((row,r)=>row.forEach((value,c)=>{const key=M.col(at.col+c)+(at.row+r),original=clipboard?.cells[M.col(clipboard.range.left+c)+(clipboard.range.top+r)];sheet.cells[key]={value:clipboard?shiftCopy(value,at.row-clipboard.range.top,at.col-clipboard.range.left):value,style:clone(original?.style||sheet.cells[key]?.style||{})};}));
  return M.normalize('sheets',result);
}
function serializeGrid(sheet,range) {const quote=v=>/[\t\n\r"]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;return Array.from({length:range.bottom-range.top+1},(_,r)=>Array.from({length:range.right-range.left+1},(_,c)=>quote(sheet.cells[M.col(range.left+c)+(range.top+r)]?.value||'')).join('\t')).join('\n');}
module.exports={rewriteReferences,changeAxis,parseGrid,pasteGrid,serializeGrid,shiftCopy};

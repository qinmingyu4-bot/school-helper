(function(root,factory){
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.StudyBridgeNoteModel=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function markup(items,ratio) {
    return items.map((item,i)=>{
      if(item.type==='text') return `<text data-index="${i}" x="${item.x*1000}" y="${item.y*1000*ratio}" fill="${escape(item.color)}" font-size="${item.width*1000}" font-family="Arial, sans-serif">${item.text.split('\n').map((line,n)=>`<tspan x="${item.x*1000}" dy="${n?item.width*1250:0}">${escape(line)}</tspan>`).join('')}</text>`;
      const points=item.points.map(p=>`${p[0]*1000},${p[1]*1000*ratio}`).join(' ');
      return `<polyline data-index="${i}" points="${points}${item.points.length===1?' '+(item.points[0][0]*1000+.01)+','+item.points[0][1]*1000*ratio:''}" fill="none" stroke="${escape(item.color)}" stroke-width="${item.width*1000}" stroke-opacity="${item.type==='highlight'?.3:1}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');
  }
  function cursor(mode,color) {
    if(mode==='hand')return 'grab';
    if(mode==='text')return 'text';
    const shapes={
      pen:'<path d="m8 24 2-8L23 3l6 6-13 13-8 2Z"/><path d="m10 16 6 6M20 6l6 6"/>',
      highlight:'<path d="m8 24 1-6L21 6l7 7-12 12-7-1Z"/><path d="m9 18 6 6M18 9l7 7"/>',
      eraser:'<path d="m8 24-5-5L17 5l11 11-8 8H8Z"/><path d="m10 12 11 11"/>'
    };
    const fill=mode==='eraser'?'#ffffff':color;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="#ffffff" stroke-width="4" stroke-linejoin="round" fill="none">${shapes[mode]}</g><g stroke="#24344a" stroke-width="1.4" stroke-linejoin="round" fill="${fill}">${shapes[mode]}</g><circle cx="8" cy="24" r="1.5" fill="#24344a"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 24, crosshair`;
  }
  function distance(p,a,b) {
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function segmentDistance(a,b,c,d) {
    const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
    const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
    if(abC*abD<0 && cdA*cdB<0)return 0;
    return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));
  }
  // Work in screen pixels, so erasing stays usable at every page aspect/zoom.
  function hit(item,from,to,size,textBox) {
    const px=p=>[p[0]*size.width,p[1]*size.height],a=px(from),b=px(to),radius=8;
    if(item.type==='text') {
      if(!textBox)return false;
      const {x,y,width,height}=textBox;
      const inside=p=>p[0]>=x-radius&&p[0]<=x+width+radius&&p[1]>=y-radius&&p[1]<=y+height+radius;
      const corners=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]];
      return inside(a)||inside(b)||corners.some((p,i)=>segmentDistance(a,b,p,corners[(i+1)%4])<=radius);
    }
    return item.points.some((p,i)=>segmentDistance(a,b,px(p),px(item.points[Math.max(0,i-1)]))<=radius+item.width*size.width/2);
  }
  // Invert PDF.js's display transform, including crop origin, rotation and UserUnit.
  function placement(viewport) {
    const [a,b,c,d,e,f]=viewport.transform,det=a*d-b*c;
    if(!Number.isFinite(det)||!det)throw Error('Invalid PDF page transform.');
    const inverse=(x,y)=>[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det];
    const p=inverse(0,viewport.height),x=inverse(viewport.width,viewport.height),y=inverse(0,0);
    return {x:p[0],y:p[1],width:Math.hypot(x[0]-p[0],x[1]-p[1]),height:Math.hypot(y[0]-p[0],y[1]-p[1]),angle:Math.atan2(x[1]-p[1],x[0]-p[0])*180/Math.PI};
  }
  return {markup,cursor,hit,placement};
});

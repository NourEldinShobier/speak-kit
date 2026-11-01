// Echo K: three exactly parallel offset strokes. Run: node designs/logo/gen/20-echo-k.mjs
import fs from 'node:fs';
const W=30, GAP=22, D=W+GAP, N=3;
const P=(x,y)=>({x,y});
const bez=(a,b,c,d,t)=>{const u=1-t;return P(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y)};
const dbez=(a,b,c,d,t)=>{const u=1-t;return P(3*u*u*(b.x-a.x)+6*u*t*(c.x-b.x)+3*t*t*(d.x-c.x),3*u*u*(b.y-a.y)+6*u*t*(c.y-b.y)+3*t*t*(d.y-c.y))};
// centerline of the arm+leg "<" : tip A -> vertex V (vertical tangent, on the stem) -> tip L; waves flick at tips
const X=0, A=P(X+235,-255), V=P(X,10), L=P(X+245,275);
const segs=[
 [A,P(A.x-95,A.y-30),P(X+95,-120),P(X+32,-52)],   // arm: tip flick then diagonal
 [P(X+32,-52),P(X-8,-8),P(X,-30),V],                // placeholder replaced below
];
// build as two smooth cubics joined at V with vertical tangent
const arm=[A,P(X+185,-272),P(X+62,-120),P(X+4,-40)];
const mid=[P(X+4,-40),P(X,-26),P(X,26),P(X+4,40)]; // keeps vertex at stem, vertical tangent
const leg=[P(X+4,40),P(X+62,120),P(X+190,282),L];
const all=[arm,mid,leg];
function sample(d){const pts=[];for(const s of all){for(let i=0;i<(s===mid?6:60);i++){const t=i/ (s===mid?6:60);const p=bez(...s,t),q=dbez(...s,t);const l=Math.hypot(q.x,q.y);pts.push({p,n:P(-q.y/l,q.x/l)})}}
 const s=all[2];const p=bez(...s,1),q=dbez(...s,1),l=Math.hypot(q.x,q.y);pts.push({p,n:P(-q.y/l,q.x/l)});
 return pts.map(o=>P(o.p.x+o.n.x*d,o.p.y+o.n.y*d));}
// stem top/bottom
const STEM_T=-290, STEM_B=330;
function toPath(pts){ // Catmull-Rom -> cubic
 let s=`M${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
 for(let i=0;i<pts.length-1;i++){const p0=pts[Math.max(i-1,0)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(i+2,pts.length-1)];
  const c1=P(p1.x+(p2.x-p0.x)/6,p1.y+(p2.y-p0.y)/6),c2=P(p2.x-(p3.x-p1.x)/6,p2.y-(p3.y-p1.y)/6);
  s+=`C${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`}
 return s}
const strokes=[];let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
for(let k=0;k<N;k++){const d=k*D;const pts=sample(d);
 for(const p of pts){minx=Math.min(minx,p.x-W/2);maxx=Math.max(maxx,p.x+W/2);miny=Math.min(miny,p.y-W/2);maxy=Math.max(maxy,p.y+W/2)}
 strokes.push({stem:`M${X-d} ${STEM_T}L${X-d} ${STEM_B}`,curve:toPath(pts)});
 minx=Math.min(minx,X-d-W/2);miny=Math.min(miny,STEM_T-W/2);maxy=Math.max(maxy,STEM_B+W/2)}
const bw=maxx-minx,bh=maxy-miny;const SC=Math.min(660/bh,680/bw);
const tx=512-(minx+bw/2)*SC, ty=512-(miny+bh/2)*SC;
const mix=(h,a)=>{const n=parseInt(h.slice(1),16);const c=[n>>16,(n>>8)&255,n&255].map(v=>Math.round(v+(255-v)*a));return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')};
const lights=[0,0.14,0.3];
const sy=miny, ey=maxy;
let defs='',body='';
strokes.forEach((s,k)=>{const l=lights[k];
 defs+=`<linearGradient id="c20-g${k}" gradientUnits="userSpaceOnUse" x1="0" y1="${sy.toFixed(0)}" x2="0" y2="${ey.toFixed(0)}"><stop offset="0" stop-color="${mix('#6B3BFF',l)}"/><stop offset="0.5" stop-color="${mix('#1E4BFF',l)}"/><stop offset="1" stop-color="${mix('#3FE0FF',l)}"/></linearGradient>`;
 body=`<g fill="none" stroke="url(#c20-g${k})" stroke-width="${W*SC}" stroke-linecap="round" stroke-linejoin="round"><path d="${s.stem}"/><path d="${s.curve}"/></g>`+body});
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>${defs}</defs><rect width="1024" height="1024" rx="232" fill="#0B0C0E"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${SC.toFixed(4)})">${body.replace(/stroke-width="[^"]+"/g,`stroke-width="${W}"`)}</g></svg>`;
fs.writeFileSync('designs/logo/svg/20-echo-k.svg',svg);console.log(bw,bh,SC);

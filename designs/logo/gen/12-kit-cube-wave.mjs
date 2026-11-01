import fs from 'fs';
const f=n=>+n.toFixed(2);
// rounded hexagon (pointy top), centerline radius R, corner radius r, via arcs
const cx=512,cy=512,R=+process.env.R||300,r=64;
const V=[...Array(6)].map((_,i)=>{const a=(-90+60*i)*Math.PI/180;return[cx+R*Math.cos(a),cy+R*Math.sin(a)]});
const t=r/Math.tan(Math.PI/3); // tangent length, interior angle 120deg
let d='';
V.forEach((p,i)=>{const a=V[(i+5)%6],b=V[(i+1)%6];
 const u=v=>{const l=Math.hypot(v[0]-p[0],v[1]-p[1]);return[(v[0]-p[0])/l,(v[1]-p[1])/l]};
 const ua=u(a),ub=u(b),s=[p[0]+ua[0]*t,p[1]+ua[1]*t],e=[p[0]+ub[0]*t,p[1]+ub[1]*t];
 d+=(i?'L':'M')+f(s[0])+' '+f(s[1])+`A${r} ${r} 0 0 1 `+f(e[0])+' '+f(e[1]);});
d+='Z';
// wave lid
const X=512,Y=456,HW=214,H=112,A=24,N=28;
const cl=u=>Y-A*Math.sin(Math.PI*u)*-1; // centerline (S wave: crest left, trough right)
const hh=u=>H*Math.pow(Math.cos(Math.PI*u/2),0.85);
const pts=s=>[...Array(N+1)].map((_,i)=>{const u=-1+2*i/N;const x=X+HW*u;return[x,Y-A*Math.sin(Math.PI*u)*-1*-1+s*hh(u)]});
// crest on top-left: centerline y = Y - A*sin(pi*(-u))... use -A*sin(-pi u)=A sin(pi u) flipped
const cy2=u=>Y+A*Math.sin(Math.PI*u);
const edge=s=>[...Array(N+1)].map((_,i)=>{const u=-1+2*i/N;return[X+HW*u,cy2(u)+s*hh(u)]});
function cr(P){let o='';for(let i=0;i<P.length-1;i++){const p0=P[Math.max(i-1,0)],p1=P[i],p2=P[i+1],p3=P[Math.min(i+2,P.length-1)];
 const c1=[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6],c2=[p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6];
 o+=`C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`}return o}
const top=edge(-1),bot=edge(1).reverse();
const lid=`M${f(top[0][0])} ${f(top[0][1])}`+cr(top)+cr(bot).replace(/^/,'')+'Z';
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="c12-grad" gradientUnits="userSpaceOnUse" x1="300" y1="500" x2="720" y2="360"><stop offset="0" stop-color="#4DE6E0"/><stop offset="0.35" stop-color="#4A9EFF"/><stop offset="0.68" stop-color="#B9A6FF"/><stop offset="1" stop-color="#7B5CFF"/></linearGradient>
<linearGradient id="c12-gloss" gradientUnits="userSpaceOnUse" x1="0" y1="${Y-A-H-10}" x2="0" y2="${Y+30}"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.6"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1024" height="1024" rx="232" fill="#111111"/>
<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="44" stroke-linejoin="round" stroke-linecap="round"/>
<path d="${lid}" fill="url(#c12-grad)"/>
<path d="${lid}" fill="url(#c12-gloss)"/>
</svg>`;
fs.writeFileSync('D:/workspaces/speak-it/designs/logo/svg/12-kit-cube-wave.svg',svg);

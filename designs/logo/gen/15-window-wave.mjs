import fs from 'fs';
const f=n=>+n.toFixed(2);
// closed Catmull-Rom -> cubic Bezier (G1)
function cr(p){const n=p.length;let d=`M${f(p[0][0])} ${f(p[0][1])}`;
 for(let i=0;i<n;i++){const a=p[(i-1+n)%n],b=p[i],c=p[(i+1)%n],e=p[(i+2)%n];
  d+=`C${f(b[0]+(c[0]-a[0])/6)} ${f(b[1]+(c[1]-a[1])/6)} ${f(c[0]-(e[0]-b[0])/6)} ${f(c[1]-(e[1]-b[1])/6)} ${f(c[0])} ${f(c[1])}`;}
 return d+'Z';}
// window superellipse
const C=512,R=322,N=3.5,win=[];
for(let i=0;i<72;i++){const t=i/72*2*Math.PI,c=Math.cos(t),s=Math.sin(t);
 win.push([C+R*Math.sign(c)*Math.abs(c)**(2/N),C+R*Math.sign(s)*Math.abs(s)**(2/N)]);}
// wave: symmetric lens with two crests
const g=(u,m,w)=>Math.exp(-(((u-m)/w)**2));
const h=u=>{const env=Math.max(0,1-u*u)**0.7;return env*(52+112*g(u,-0.22,0.34)+70*g(u,0.5,0.22))};
const cx=512,cy=450,W=226,top=[],bot=[];
const K=30;
for(let i=1;i<K;i++){const u=-1+2*i/K;top.push([cx+u*W,cy-h(u)]);}
for(let i=K-1;i>=1;i--){const u=-1+2*i/K;bot.push([cx+u*W,cy+h(u)]);}
const wave=cr([[cx-W,cy],...top,[cx+W,cy],...bot]);
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<clipPath id="c15-clip"><path d="${cr(win)}"/></clipPath>
<linearGradient id="c15-wave" gradientUnits="userSpaceOnUse" x1="0" y1="270" x2="0" y2="660"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#F6FAFF"/><stop offset="1" stop-color="#E6F0FF"/></linearGradient>
<linearGradient id="c15-glow" gradientUnits="userSpaceOnUse" x1="0" y1="830" x2="0" y2="590"><stop offset="0" stop-color="#1E6BFF"/><stop offset="0.35" stop-color="#1E6BFF" stop-opacity="0.55"/><stop offset="1" stop-color="#1E6BFF" stop-opacity="0"/></linearGradient>
<radialGradient id="c15-bloom" gradientUnits="userSpaceOnUse" cx="512" cy="840" r="260" gradientTransform="translate(512 840) scale(1 0.55) translate(-512 -840)"><stop offset="0" stop-color="#3D8BFF" stop-opacity="0.9"/><stop offset="1" stop-color="#1E6BFF" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1024" height="1024" rx="232" fill="#FFFFFF"/>
<rect x="1" y="1" width="1022" height="1022" rx="231" fill="none" stroke="#E6E6E6" stroke-width="2"/>
<path d="${cr(win)}" fill="#0A0B0D"/>
<g clip-path="url(#c15-clip)"><rect x="190" y="600" width="644" height="240" fill="url(#c15-glow)"/><rect x="190" y="600" width="644" height="240" fill="url(#c15-bloom)"/></g>
<path d="${wave}" fill="url(#c15-wave)"/>
</svg>`;
fs.writeFileSync('D:/workspaces/speak-it/designs/logo/svg/15-window-wave.svg',svg);

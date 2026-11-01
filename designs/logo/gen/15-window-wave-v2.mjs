import fs from 'fs';
const f=n=>+n.toFixed(2);
function cr(p){const n=p.length;let d=`M${f(p[0][0])} ${f(p[0][1])}`;
 for(let i=0;i<n;i++){const a=p[(i-1+n)%n],b=p[i],c=p[(i+1)%n],e=p[(i+2)%n];
  d+=`C${f(b[0]+(c[0]-a[0])/6)} ${f(b[1]+(c[1]-a[1])/6)} ${f(c[0]-(e[0]-b[0])/6)} ${f(c[1]-(e[1]-b[1])/6)} ${f(c[0])} ${f(c[1])}`;}
 return d+'Z';}
// window: true superellipse n=4, 62% of tile
const C=512,R=0.62*1024/2,N=4,win=[];
for(let i=0;i<96;i++){const t=i/96*2*Math.PI,c=Math.cos(t),s=Math.sin(t);
 win.push([C+R*Math.sign(c)*Math.abs(c)**(2/N),C+R*Math.sign(s)*Math.abs(s)**(2/N)]);}
// wave: key heights, closed Catmull-Rom (G1)
const T=[[0.04,9],[0.10,32],[0.17,72],[0.23,114],[0.27,141],[0.31,158],[0.35,164],[0.39,158],[0.43,141],[0.48,110],[0.53,82],[0.575,70],[0.62,78],[0.665,98],[0.70,110],[0.735,114],[0.77,108],[0.81,92],[0.86,64],[0.91,36],[0.96,12]];
const B=[[0.04,8],[0.10,26],[0.17,54],[0.25,82],[0.34,98],[0.42,93],[0.50,78],[0.57,66],[0.65,71],[0.73,77],[0.80,68],[0.87,44],[0.93,21],[0.97,9]];
const W=0.64*2*R, x0=C-W/2;
const top=T.map(([u,h])=>[x0+u*W,-h]), bot=B.map(([u,h])=>[x0+u*W,h]);
const ys=[...top,...bot].map(p=>p[1]);
const mn=Math.min(...ys),mx=Math.max(...ys);
const cy=C-14-(mn+mx)/2;
const pts=[[x0,cy],...top.map(p=>[p[0],cy+p[1]]),[x0+W,cy],...bot.slice().reverse().map(p=>[p[0],cy+p[1]])];
const wave=cr(pts);
const wp=cr(win);
const wy0=cy+mn, wy1=cy+mx;
const bot0=C+R, H=2*R;
// glow: radial centre below bottom edge, fades by ~45% of height
const gr=0.45*H, gcy=bot0+0.06*H;
const ease=[[0,1],[0.15,.82],[0.3,.6],[0.45,.4],[0.6,.24],[0.75,.12],[0.88,.04],[1,0]];
const stops=ease.map(([o,a])=>`<stop offset="${o}" stop-color="#1E6BFF" stop-opacity="${a}"/>`).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
<clipPath id="c15-clip"><path d="${wp}"/></clipPath>
<linearGradient id="c15-wave" gradientUnits="userSpaceOnUse" x1="0" y1="${f(wy0)}" x2="0" y2="${f(wy1)}"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="#F1F6FF"/><stop offset="1" stop-color="#E3EEFF"/></linearGradient>
<radialGradient id="c15-glow" gradientUnits="userSpaceOnUse" cx="512" cy="${f(gcy)}" r="${f(gr)}" gradientTransform="translate(512 ${f(gcy)}) scale(1.35 1) translate(-512 ${-f(gcy)})">${stops}</radialGradient>
<radialGradient id="c15-core" gradientUnits="userSpaceOnUse" cx="512" cy="${f(gcy)}" r="${f(gr*0.45)}" gradientTransform="translate(512 ${f(gcy)}) scale(1.5 1) translate(-512 ${-f(gcy)})"><stop offset="0" stop-color="#4DE6E0" stop-opacity="0.38"/><stop offset="0.4" stop-color="#3FB6F0" stop-opacity="0.2"/><stop offset="0.75" stop-color="#2D8CF8" stop-opacity="0.06"/><stop offset="1" stop-color="#1E6BFF" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1024" height="1024" rx="232" fill="#FFFFFF"/>
<rect x="0.75" y="0.75" width="1022.5" height="1022.5" rx="231.25" fill="none" stroke="#E6E6E6" stroke-width="1.5"/>
<path d="${wp}" fill="#0A0B0D"/>
<g clip-path="url(#c15-clip)"><rect x="${C-R}" y="${f(bot0-gr-20)}" width="${2*R}" height="${f(gr+20)}" fill="url(#c15-glow)"/><rect x="${C-R}" y="${f(bot0-gr-20)}" width="${2*R}" height="${f(gr+20)}" fill="url(#c15-core)"/></g>
<path d="${wave}" fill="url(#c15-wave)"/>
</svg>`;
fs.writeFileSync('D:/workspaces/speak-it/designs/logo/svg/15-window-wave-v2.svg',svg);
console.log({R,W,cy,wy0,wy1});

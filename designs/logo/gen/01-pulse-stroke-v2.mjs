import fs from 'node:fs';
const SW=80, R=Math.PI/180;
// anchors: x,y,angle(deg, y down),hin,hout  (collinear handles => G1)
const A=[
 [232,566, 7,  0, 34],
 [326,588, -2, 40, 52],
 [416,468,-64, 56, 64],
 [516,290, 0,  66, 66],
 [596,404, 84, 44, 52],
 [594,604, 90, 0, 0],   // placeholder replaced below
];
// rebuild explicitly
const Rt=66, cx=678, by=682; // trough radius (centreline)
const K=0.5523*Rt;
const P=[
 [236,560, 8,  0, 32],
 [304,586,-1, 36, 52],
 [398,476,-62, 44, 86],
 [504,294, 0,  84, 74],
 [616,410, 86, 70, 56],
 [cx-Rt,by-Rt, 90, 50, K],
 [cx,by, 0, K, K],
 [cx+Rt,by-Rt,-90, K, 58],
 [814,522, -4, 54, 38],
 [880,506,-10, 30, 0],
];
const pt=(p,s)=>[p[0]+s*Math.cos(p[2]*R)*0, 0];
let segs=[];
for(let i=0;i<P.length-1;i++){
 const a=P[i],b=P[i+1];
 const c1=[a[0]+a[4]*Math.cos(a[2]*R), a[1]+a[4]*Math.sin(a[2]*R)];
 const c2=[b[0]-b[3]*Math.cos(b[2]*R), b[1]-b[3]*Math.sin(b[2]*R)];
 segs.push([[a[0],a[1]],c1,c2,[b[0],b[1]]]);
}
const bz=(s,t)=>{const u=1-t;return [0,1].map(k=>u*u*u*s[0][k]+3*u*u*t*s[1][k]+3*u*t*t*s[2][k]+t*t*t*s[3][k]);};
const samp=[];segs.forEach(s=>{for(let i=0;i<=60;i++)samp.push(bz(s,i/60));});
// bbox of stroke + dot
const tail=P[P.length-1], ta=tail[2]*R;
const dotR=20, off=SW/2+22+dotR;
let dot=[tail[0]-24+off*Math.sin(ta), tail[1]-off*Math.cos(ta)];
const xs=samp.map(p=>p[0]),ys=samp.map(p=>p[1]);
let x0=Math.min(...xs)-SW/2,x1=Math.max(...xs)+SW/2,y0=Math.min(...ys)-SW/2,y1=Math.max(...ys)+SW/2;
y0=Math.min(y0,dot[1]-dotR);
const W=x1-x0, dx=512-(x0+x1)/2, dy=512-(y0+y1)/2;
// trough inner gap: min distance between samples far apart in index
let gap=1e9;for(let i=0;i<samp.length;i++)for(let j=i+120;j<samp.length;j++){const d=Math.hypot(samp[i][0]-samp[j][0],samp[i][1]-samp[j][1]);if(d<gap)gap=d;}
console.log('width',W.toFixed(1),'height',(y1-y0).toFixed(1),'trough inner gap',(gap-SW).toFixed(1),'shift',dx.toFixed(1),dy.toFixed(1));
const f=v=>+v.toFixed(2);
const build=(sc,tx,ty)=>{const T=([x,y])=>[f((x+dx-512)*sc+512+tx),f((y+dy-512)*sc+512+ty)];
 let d='M'+T(segs[0][0]).join(',');
 segs.forEach(s=>{d+=' C'+[s[1],s[2],s[3]].map(p=>T(p).join(',')).join(' ');});
 const dd=T(dot);
 // gradient axis (diagonal) in final coords
 const g=[T([250,330]),T([880,560])];
 return {d,dot:dd,g,sw:f(SW*sc),r:f(dotR*sc)};};
const stops=`<stop offset="0" stop-color="#6B3BFF"/><stop offset="0.3" stop-color="#5A3BFF"/><stop offset="0.58" stop-color="#1E3CFF"/><stop offset="0.78" stop-color="#1E3CFF"/><stop offset="0.93" stop-color="#3FE0FF"/><stop offset="1" stop-color="#3FE0FF"/>`;
const svg=(m,bg,mono)=>`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><linearGradient id="c01-grad" gradientUnits="userSpaceOnUse" x1="${m.g[0][0]}" y1="${m.g[0][1]}" x2="${m.g[1][0]}" y2="${m.g[1][1]}">${stops}</linearGradient></defs>
${bg?'<rect width="1024" height="1024" rx="232" fill="#0B0C0E"/>\n':''}<path d="${m.d}" fill="none" stroke="${mono?'#FFFFFF':'url(#c01-grad)'}" stroke-width="${m.sw}" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${m.dot[0]}" cy="${m.dot[1]}" r="${m.r}" fill="${mono?'#FFFFFF':'#F2C04E'}"/>
</svg>`;
const out='D:/workspaces/speak-it/designs/logo/svg/01-pulse-stroke-v2';
fs.writeFileSync(out+'.svg',svg(build(1,0,0),0,0));
fs.writeFileSync(out+'-tile.svg',svg(build(0.64,0,0),1,0));
fs.writeFileSync(out+'-mono.svg',svg(build(0.64,0,0),1,1));

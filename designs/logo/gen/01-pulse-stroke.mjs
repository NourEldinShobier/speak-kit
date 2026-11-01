import fs from 'node:fs';
const S=1.3, T=([x,y])=>[(x-400)*S+512,(y-400)*S+512].map(v=>+v.toFixed(1));
const P=(...a)=>a.map(T).join(' ');
const segs=[
 ['M',[245,417]],
 ['C',[262,422],[278,424],[294,420]],
 ['C',[324,412],[338,292],[376,292]],
 ['C',[410,292],[398,314],[398,346]],
 ['L',[400,452]],
 ['C',[402,488],[414,508],[436,508]],
 ['C',[458,508],[470,490],[472,462]],
 ['C',[476,420],[492,388],[528,388]],
 ['C',[545,388],[562,386],[578,386]],
];
const d=segs.map(([c,...p])=>c+P(...p)).join(' ');
const [x0]=T([245,0]),[x1]=T([578,0]);
const dot=T([566,330]);
fs.writeFileSync('designs/logo/svg/01-pulse-stroke.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><linearGradient id="c01-grad" gradientUnits="userSpaceOnUse" x1="${x0}" y1="0" x2="${x1}" y2="0">
<stop offset="0" stop-color="#6B3BFF"/><stop offset="0.38" stop-color="#4A3BFF"/><stop offset="0.52" stop-color="#2D3BFF"/><stop offset="0.7" stop-color="#1460FF"/><stop offset="0.82" stop-color="#1460FF"/><stop offset="1" stop-color="#3FE0FF"/></linearGradient></defs>
<path d="${d}" fill="none" stroke="url(#c01-grad)" stroke-width="76" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${dot[0]}" cy="${dot[1]}" r="21" fill="#F2C04E"/>
</svg>`);

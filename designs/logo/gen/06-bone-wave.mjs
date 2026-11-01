import fs from 'node:fs';
// anchors with explicit tangent directions (deg, screen coords) => G1 by construction
const A = [
[-306,70,-90],[-291,2,-90],[-306,-62,-90],[-205,-150,0],[20,-82,0],[196,-168,0],[314,-76,90],[298,-10,90],[314,64,90],[246,132,180],[-14,40,180],[-232,120,180]];
const K = +process.env.K || 0.42;
const ang=-8*Math.PI/180, cx=512, cy=512;
const rot=(x,y)=>[x*Math.cos(ang)-y*Math.sin(ang), x*Math.sin(ang)+y*Math.cos(ang)];
const S=A.map(([x,y,t])=>({p:rot(x,y),t:t*Math.PI/180+ang}));
const n=S.length,f=v=>v.toFixed(1);
// bbox via sampling
const seg=(a,b)=>{const L=Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1])*K;
 return [a.p, [a.p[0]+Math.cos(a.t)*L,a.p[1]+Math.sin(a.t)*L],[b.p[0]-Math.cos(b.t)*L,b.p[1]-Math.sin(b.t)*L],b.p];};
const segs=S.map((s,i)=>seg(s,S[(i+1)%n]));
let mx=[1e9,-1e9,1e9,-1e9];
for(const [p0,p1,p2,p3] of segs)for(let u=0;u<=1;u+=0.01){const w=[0,1].map(k=>(1-u)**3*p0[k]+3*(1-u)**2*u*p1[k]+3*(1-u)*u*u*p2[k]+u**3*p3[k]);
 mx=[Math.min(mx[0],w[0]),Math.max(mx[1],w[0]),Math.min(mx[2],w[1]),Math.max(mx[3],w[1])];}
const ox=cx-(mx[0]+mx[1])/2, oy=cy-(mx[2]+mx[3])/2;
let d=`M${f(segs[0][0][0]+ox)} ${f(segs[0][0][1]+oy)}`;
for(const [,p1,p2,p3] of segs)d+=`C${f(p1[0]+ox)} ${f(p1[1]+oy)} ${f(p2[0]+ox)} ${f(p2[1]+oy)} ${f(p3[0]+ox)} ${f(p3[1]+oy)}`;
d+='Z';
fs.writeFileSync('designs/logo/svg/06-bone-wave.svg',
`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="232" fill="#0B0C0E"/><path d="${d}" fill="#FFFFFF"/></svg>`);
console.log(mx[1]-mx[0], mx[3]-mx[2]);

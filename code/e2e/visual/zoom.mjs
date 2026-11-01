// usage: node zoom.mjs ID x y w h [scale] [dy]  -> out/zoom.png : design (top) over built (bottom), nearest-neighbour upscaled. dy shifts the built crop vertically.
import {PNG} from "pngjs";import fs from "fs";
const [,, id, X, Y, W, H, S="3", DY="0"]=process.argv;const x=+X,y=+Y,w=+W,h=+H,s=+S,dy=+DY;
const ld=k=>PNG.sync.read(fs.readFileSync(`out/${k}/${id}.png`));
const d=ld("design"),b=ld("built");
const out=new PNG({width:w*s,height:(h*2)*s+6});out.data.fill(200);
const put=(src,oy,sy)=>{for(let j=0;j<h*s;j++)for(let i=0;i<w*s;i++){const sx=x+Math.floor(i/s),syy=sy+Math.floor(j/s);if(sx>=src.width||syy>=src.height||syy<0)continue;const a=(syy*src.width+sx)*4,o=((oy+j)*out.width+i)*4;for(let k=0;k<4;k++)out.data[o+k]=src.data[a+k]}};
put(d,0,y);put(b,h*s+6,y+dy);
fs.writeFileSync("out/zoom.png",PNG.sync.write(out));

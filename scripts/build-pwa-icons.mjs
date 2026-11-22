/**
 * Generate PNG icons using only Node.js built-ins.
 * Run before Cloudflare deploy; images are generated in public/icons/.
 * Copyright-free original PowerResolve icon (white lightning bolt on navy blue).
 */
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
const out='public/icons';
fs.mkdirSync(out,{recursive:true});
const crcTable=Array.from({length:256},(_,n)=>{
  for(let j=0;j<8;j++)n=(n&1)?(0xedb88320^(n>>>1)):(n>>>1);
  return n>>>0;
});
function crc32(buf){
  let crc=0xffffffff;
  for(const b of buf) crc=crcTable[(crc^b)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data){
  const tag=Buffer.from(type,'ascii'),size=Buffer.alloc(4),tail=Buffer.alloc(4);
  size.writeUInt32BE(data.length);tail.writeUInt32BE(crc32(Buffer.concat([tag,data])));
  return Buffer.concat([size,tag,data,tail]);
}
function insidePoly(x,y,points) {
  let c=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;
  }
  return c;
}
function icon(size){
  const raw=Buffer.alloc((size*4+1)*size),radius=.24;
  const poly=[[.55,.16],[.29,.53],[.46,.53],[.39,.85],[.75,.43],[.56,.43],[.65,.16]];
  for(let y=0;y<size;y++){
    const row=y*(size*4+1);raw[row]=0;
    for(let x=0;x<size;x++){
      const u=(x+.5)/size,v=(y+.5)/size;
      const qx=Math.abs(u-.5),qy=Math.abs(v-.5);
      const dx=Math.max(qx-(.5-radius),0),dy=Math.max(qy-(.5-radius),0);
      const rounded=dx*dx+dy*dy<=radius*radius;
      const inset=.12, inner=(u>inset&&u<1-inset&&v>inset&&v<1-inset);
      const bolt=inner&&insidePoly((u-inset)/(1-2*inset),(v-inset)/(1-2*inset),poly);
      const pos=row+1+x*4;
      const light=(u+v)/2;
      const rgb=bolt?[255,255,255]:[Math.round(18+11*light),Math.round(39+46*light),Math.round(79+90*light)];
      raw[pos]=rgb[0];raw[pos+1]=rgb[1];raw[pos+2]=rgb[2];raw[pos+3]=rounded?255:0;
    }
  }
  const header=Buffer.alloc(13);
  header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
for(const size of [192,512]){
  const file=`${out}/powerresolve-${size}.png`;
  fs.writeFileSync(file,icon(size));
  console.log('Generated PWA app icon:',file);
}

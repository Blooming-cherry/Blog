const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require(process.env.BLOG_SHARP_MODULE||'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const {createCanvas,loadImage}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
(async()=>{
 const rig=JSON.parse(await fs.readFile(path.join(__dirname,'rig.json'),'utf8'));
 const grid=createCanvas(rig.width,rig.height),g=grid.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,rig.width,rig.height);g.drawImage(await loadImage(path.join(__dirname,rig.source)),0,0);
 g.font='18px Arial';g.lineWidth=1;
 for(let x=0;x<rig.width;x+=100){g.strokeStyle='#d8505080';g.beginPath();g.moveTo(x,0);g.lineTo(x,rig.height);g.stroke();g.fillStyle='#b00';g.fillText(String(x),x+3,22);}
 for(let y=0;y<rig.height;y+=100){g.strokeStyle='#d8505080';g.beginPath();g.moveTo(0,y);g.lineTo(rig.width,y);g.stroke();g.fillStyle='#b00';g.fillText(String(y),3,y+20);}
 await fs.writeFile(path.join(__dirname,'layers','source-grid.png'),grid.toBuffer('image/png'));
 const sheet=createCanvas(1000,Math.ceil(rig.layers.length/4)*230),s=sheet.getContext('2d');s.fillStyle='#f0f2f5';s.fillRect(0,0,sheet.width,sheet.height);
 for(let i=0;i<rig.layers.length;i++){const layer=rig.layers[i],image=await loadImage(path.join(__dirname,layer.file)),x=(i%4)*250,y=Math.floor(i/4)*230;s.fillStyle='#fff';s.fillRect(x+6,y+6,238,218);const z=Math.min(210/image.width,175/image.height);s.drawImage(image,x+125-image.width*z/2,y+12+(175-image.height*z)/2,image.width*z,image.height*z);s.fillStyle='#263b54';s.font='14px Arial';s.fillText(layer.id,x+15,y+207);}
 await fs.writeFile(path.join(__dirname,'layers-overview.png'),sheet.toBuffer('image/png'));
 console.log('Saved source coordinate grid and layer overview.');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Execute the actual preview renderer against a small DOM adapter and Skia canvas.
// This verifies rendering, not browser layout or a production deployment.
const fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createCanvas,loadImage,DOMMatrix}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const root=__dirname;
function element(){return {value:'0',checked:false,dataset:{},style:{},listeners:{},classList:{toggle(){}},append(){},addEventListener(k,fn){this.listeners[k]=fn;},fire(k){this.listeners[k]?.({target:this});}};}
(async()=>{
  const source=await fs.readFile(path.join(root,'motion-preview.js'),'utf8');
  const nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const canvas=createCanvas(880,880);Object.assign(canvas,element());nodes.set('#model',canvas);
  const motions=['blink','nod','wave','happy','tail'].map(name=>Object.assign(element(),{dataset:{motion:name}}));
  let queued=null,now=1000;const errors=[];
  const document={hidden:false,querySelector:get,querySelectorAll:s=>s==='[data-motion]'?motions:[],createElement:element,createTextNode:s=>s,addEventListener(){}};
  class LocalImage{set src(url){loadImage(path.join(root,url)).then(img=>{this.bitmap=img;this.onload();},e=>this.onerror(e));}}
  const ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(img,...args)=>draw(img.bitmap||img,...args);
  const context={document,DOMMatrix,Image:LocalImage,matchMedia:()=>({matches:false,addEventListener(){}}),performance:{now:()=>now},requestAnimationFrame:fn=>{queued=fn;return 1;},cancelAnimationFrame:()=>{queued=null;},console:{error:e=>errors.push(String(e))},fetch:async file=>({json:async()=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'))})};
  vm.runInNewContext(source,context);
  for(let i=0;i<200&&!canvas.dataset.renderer&&!errors.length;i++)await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(errors,[]);assert.equal(canvas.dataset.renderer,'segmented-canvas2d');
  function frame(){const fn=queued;queued=null;assert(fn,'Renderer must schedule a frame');fn(now);}
  frame();
  const sheet=createCanvas(1320,950),out=sheet.getContext('2d');out.fillStyle='#edf0f5';out.fillRect(0,0,1320,950);
  const poses=[['wave',0],['wave',.18],['wave',.45],['wave',.65],['wave',.87],['nod',0],['nod',.42],['nod',1]];
  for(let i=0;i<poses.length;i++){
    const [name,p]=poses[i];
    get('#rest').fire('click');frame();
    if(name==='wave'){get('#wavePose').value=String(p*100);get('#wavePose').fire('input');}
    else {motions.find(b=>b.dataset.motion===name).fire('click');now+=p*1350;}
    frame();
    const x=i%4*330,y=Math.floor(i/4)*475;
    out.fillStyle='#fff';out.fillRect(x+5,y+5,320,465);out.drawImage(canvas,x+5,y+35,320,320);
    out.fillStyle='#1f3550';out.font='18px sans-serif';out.fillText(`${name} ${Math.round(p*100)}%`,x+15,y+28);
    // Enlarged elbow crop for wave, whole head for nod.
    if(name==='wave')out.drawImage(canvas,490,430,180,170,x+130,y+345,120,113);
    else out.drawImage(canvas,250,80,370,390,x+130,y+345,110,116);
  }
  await fs.writeFile(path.join(root,'motion-check.png'),sheet.toBuffer('image/png'));
  get('#rest').fire('click');frame();
  assert.equal(get('#wavePose').value,'0');
  console.log(JSON.stringify({renderer:canvas.dataset.renderer,poses:poses.length,errors,output:'motion-check.png'}));
})().catch(e=>{console.error(e);process.exitCode=1;});

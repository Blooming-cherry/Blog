(() => {
  'use strict';
  const canvas=document.querySelector('#model'),mainCtx=canvas.getContext('2d'),status=document.querySelector('#status');
  let ctx=mainCtx;
  const headBack=document.createElement('canvas'),headFront=document.createElement('canvas');
  headBack.width=headFront.width=canvas.width;headBack.height=headFront.height=canvas.height;
  const backCtx=headBack.getContext('2d'),frontCtx=headFront.getContext('2d');
  const rearIds=new Set(['hair-left','hair-right']);
  const headIds=new Set(['hair-left','hair-right','head','bangs','fin-left','fin-right','ahoge','eye-left','eye-right','iris-left','iris-right','mouth']);
  const playing=document.querySelector('#playing'),follow=document.querySelector('#follow'),explode=document.querySelector('#explode');
  const blinkPose=document.querySelector('#blinkPose'),armPose=document.querySelector('#armPose'),tailPose=document.querySelector('#tailPose');
  const wavePose=document.querySelector('#wavePose');
  const nodPose=document.querySelector('#nodPose'),happyPose=document.querySelector('#happyPose');
  let heldAction=null;
  let heldWave=false;
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  function waveJoints(p){
    const lift=smooth(p/.24)*(1-smooth((p-.76)/.24));
    const elbow=smooth((p-.05)/.24)*(1-smooth((p-.72)/.24));
    const swing=p>.30&&p<.72?Math.sin((p-.30)/.42*Math.PI*4)*Math.sin((p-.30)/.42*Math.PI):0;
    const swayEnvelope=smooth(p/.20)*(1-smooth((p-.78)/.22));
    return {shoulder:-24*lift,elbow:-112*elbow,wrist:12*elbow+9*swing,
      head:3.2*Math.sin((p-.08)*Math.PI*3)*swayEnvelope,
      hair:-.65*Math.sin((p-.12)*Math.PI*3)*swayEnvelope};
  }
  function happyJoints(p){
    const lift=smooth(p/.24)*(1-smooth((p-.80)/.20));
    return {shoulder:-22*lift,elbow:-112*lift,wrist:8*lift,head:-5*lift,hair:.7*lift};
  }
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let rig,ready=false,frame=0,last=0,time=0,nextBlink=3,blinkAt=-10,action=null,actionAt=0,target=[0,0],look=[0,0],rest=false;
  const images=new Map(),seams=new Map(),visible=new Set();
  let waveBacking,peaceHand;
  const names={blink:'独立眼睑眨眼',nod:'俯仰点头',wave:'挥手与左右偏头',happy:'眨眼 · 偏头 · 比耶',tail:'独立鲸尾摆动'};
  const order=['tail','hair-left','hair-right','leg-left','leg-right','body','skirt','arm-left','arm-right','hand-left','hand-right','head','bangs','fin-left','fin-right','ahoge','eye-left','eye-right','iris-left','iris-right','mouth'];
  const load=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('图层载入失败：'+url));image.src=url;});
  function trace(shape){ctx.beginPath();if(shape.ellipse){const e=shape.ellipse;ctx.ellipse(e[0]*rig.width,e[1]*rig.height,e[2]*rig.width,e[3]*rig.height,0,0,Math.PI*2);}else{shape.polygon.forEach(([x,y],i)=>i?ctx.lineTo(x*rig.width,y*rig.height):ctx.moveTo(x*rig.width,y*rig.height));ctx.closePath();}}
  const pivotTransform=(parent,pivot,angle=0,sx=1,sy=1,dx=0,dy=0)=>parent.translate(pivot[0]*rig.width+dx,pivot[1]*rig.height+dy).rotate(angle).scale(sx,sy).translate(-pivot[0]*rig.width,-pivot[1]*rig.height);
  function schedule(){if(ready&&!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
  function trigger(name){heldAction=null;heldWave=false;wavePose.value=nodPose.value=happyPose.value='0';rest=false;explode.checked=false;blinkPose.value=armPose.value=tailPose.value='0';if(reduced.matches){status.textContent='已遵循系统减少动态效果设置。';return;}action=name;actionAt=performance.now();status.textContent=names[name];schedule();}
  function draw(now){
    frame=0;if(!ready||document.hidden)return;
    const dt=last?Math.min((now-last)/1000,.05):0;last=now;
    const active=playing.checked&&!reduced.matches&&!explode.checked&&!rest;
    if(active)time+=dt;
    if(active&&time>=nextBlink){blinkAt=time;nextBlink=time+3.2+Math.random()*2.4;}
    look=look.map((v,i)=>v+(target[i]-v)*.12);
    const elapsed=(now-actionAt)/1000,duration=rig.actions[action]?.seconds||1.35;
    const phase=heldAction?Number((heldAction==='nod'?nodPose:happyPose).value)/100:Math.min(1,elapsed/duration);
    const motion=heldAction||action,envelope=motion?Math.sin(Math.PI*phase):0;
    if(elapsed>duration)action=null;
    const amplitude=active?1:0;
    let blink=active?Math.max(0,1-Math.abs((time-blinkAt-.10)/.10)):0;
    if(action==='blink')blink=Math.max(0,1-Math.abs((elapsed-.11)/.11));
    if(motion==='happy')blink=Math.max(blink,Math.max(0,1-Math.abs((phase-.28)/.065)));
    blink=Math.max(blink,Number(blinkPose.value)/100);
    if(rest||explode.checked||reduced.matches)blink=0;
    const open=Math.max(.025,1-blink),response=rest||explode.checked?0:envelope;
    const tracking=follow.checked&&!rest&&!explode.checked&&!reduced.matches?look:[0,0];
    const root=new DOMMatrix(),torso=root.translate(0,-Math.sin(time*1.7)*1.7*amplitude);
    const gesturing=!rest&&!explode.checked&&!reduced.matches;
    const waving=gesturing&&(heldWave||motion==='wave'||motion==='happy');
    const wave=waving?(motion==='happy'?happyJoints(phase):waveJoints(heldWave?Number(wavePose.value)/100:phase)):{shoulder:0,elbow:0,wrist:0,head:0,hair:0};
    const pitch=gesturing&&motion==='nod'?.20*smooth(phase/.38)*(1-smooth((phase-.5)/.5)):0;
    const headAngle=Math.sin(time*1.1)*.35*amplitude+(waving||pitch?0:tracking[0]*.7)+wave.head;
    // Roll around the neck attachment. No nod translation or vertical squash.
    const head=pivotTransform(torso,rig.groups.headGroup.pivot,headAngle,1,1,waving||pitch?0:tracking[0]*1.4,waving||pitch?0:tracking[1]*.7);
    const armL=pivotTransform(torso,rig.groups.armLeftGroup.pivot,-.35*Math.sin(time*1.7)*amplitude);
    const armR=pivotTransform(torso,rig.groups.armRightGroup.pivot,.35*Math.sin(time*1.7)*amplitude+wave.shoulder+(rest||explode.checked?0:Number(armPose.value)));
    const forearmR=pivotTransform(armR,rig.groups.forearmRightGroup.pivot,wave.elbow);
    const groups={root,torso,headGroup:head,armLeftGroup:armL,armRightGroup:armR,
      forearmRightGroup:forearmR,handLeftGroup:pivotTransform(armL,rig.groups.handLeftGroup.pivot,0),handRightGroup:pivotTransform(forearmR,rig.groups.handRightGroup.pivot,wave.wrist),
      eyeLeftGroup:pivotTransform(head,rig.groups.eyeLeftGroup.pivot,0,1,open),eyeRightGroup:pivotTransform(head,rig.groups.eyeRightGroup.pivot,0,1,open)};
    const transforms=new Map();
    for(const layer of rig.layers){
      let angle=0,dx=0,dy=0,sy=1;
      if(layer.id==='tail')angle=Math.sin(time*1.5)*1.1*amplitude+(action==='tail'?Math.sin(elapsed*8)*3.5*response:0)+Number(tailPose.value);
      if(layer.id.startsWith('hair-'))angle=Math.sin(time*1.6+(layer.id==='hair-left'?0:.7))*.55*amplitude+wave.hair;
      if(layer.id.startsWith('fin-'))angle=Math.sin(time*1.8)*.45*amplitude;
      if(layer.id==='ahoge')angle=Math.sin(time*2)*1.1*amplitude;
      if(layer.id==='bangs')angle=Math.sin(time*1.4)*.12*amplitude;
      if(layer.id==='skirt')angle=Math.sin(time*1.7)*.12*amplitude;
      if(layer.id.startsWith('iris-')){dx=tracking[0]*2.0;dy=tracking[1]*1.1;}
      if(layer.id==='mouth'&&action==='happy')sy=1+.08*response;
      if(rest||explode.checked){angle=0;dx=0;dy=0;sy=1;}
      let matrix=pivotTransform(groups[layer.parent],layer.pivot,angle,1,sy,dx,dy);
      if(explode.checked){const b=layer.bounds,cx=(b[0]+b[2])/2/rig.width,cy=(b[1]+b[3])/2/rig.height;matrix=new DOMMatrix().translate((cx-.48)*180,(cy-.5)*180);if(layer.id.startsWith('eye-'))matrix=matrix.translate(layer.id.endsWith('left')?-35:35,0);if(layer.id.startsWith('iris-'))matrix=matrix.translate(layer.id.endsWith('left')?-70:70,-30);}
      transforms.set(layer.id,matrix);
    }
    for(const target of[mainCtx,backCtx,frontCtx]){target.setTransform(1,0,0,1,0,0);target.clearRect(0,0,canvas.width,canvas.height);}
    const scale=Math.min(canvas.width/rig.width,canvas.height/rig.height)*(explode.checked?.72:.91);
    const base=new DOMMatrix().translate(canvas.width/2,canvas.height/2).scale(scale).translate(-rig.width/2,-rig.height/2);
    const set=(matrix,id)=>{ctx=pitch&&headIds.has(id)?(rearIds.has(id)?backCtx:frontCtx):mainCtx;const m=base.multiply(matrix);ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);};
    const neck=rig.groups.headGroup.pivot.map((v,i)=>v*(i?rig.height:rig.width));
    let backFlushed=false,frontFlushed=false;
    const flushBack=()=>{if(!pitch||backFlushed)return;CompanionHeadProjection.paint(mainCtx,headBack,pitch,base.multiply(torso),neck);backFlushed=true;};
    const lids=()=>{if(blink<=.8||explode.checked)return;set(head,'head');ctx.strokeStyle='#392c42';ctx.lineWidth=3;ctx.lineCap='round';for(const x of[.397,.547]){ctx.beginPath();ctx.moveTo((x-.033)*rig.width,.407*rig.height);ctx.quadraticCurveTo(x*rig.width,.416*rig.height,(x+.033)*rig.width,.407*rig.height);ctx.stroke();}};
    const flushFront=()=>{if(!pitch||frontFlushed)return;lids();CompanionHeadProjection.paint(mainCtx,headFront,pitch,base.multiply(torso),neck);frontFlushed=true;};
    function imageAt(image,bounds){ctx.drawImage(image,bounds[0],bounds[1],bounds[2]-bounds[0],bounds[3]-bounds[1]);}
    const completedHair=!explode.checked;
    if(completedHair&&visible.has('hair-right')){set(transforms.get('hair-right'),'hair-right');ctx.drawImage(waveBacking,0,0,rig.width,rig.height);}
    const armParts=['arm-right','forearm-right','hand-right'];
    if(!explode.checked){for(const seam of rig.seams){
      if((completedHair&&seam.id==='hair-right')||armParts.includes(seam.id)||!visible.has(seam.id)||seam.id.startsWith('iris-')||seam.id.startsWith('eye-')||seam.id==='mouth')continue;
      set(transforms.get(seam.id),seam.id);imageAt(seams.get(seam.id),seam.bounds);
    }}
    if(!explode.checked){set(head,'head');for(const id of['eye-left','eye-right','mouth']){trace(rig.layers.find(l=>l.id===id).shape);ctx.fillStyle='#ffefea';ctx.fill();}}
    for(const id of order){
      if(id==='leg-left')flushBack();if(id==='forearm-right')flushFront();
      if(!visible.has(id)||(completedHair&&id==='hair-right'))continue;const layer=rig.layers.find(l=>l.id===id);set(transforms.get(id),id);
      if(!explode.checked&&armParts.includes(id)){
        const seam=rig.seams.find(s=>s.id===id);
        if(seam&&!(id==='hand-right'&&motion==='happy'&&phase>.20&&phase<.85))imageAt(seams.get(id),seam.bounds);
      }
      if(id==='forearm-right'&&!explode.checked&&!rest&&Math.abs(wave.elbow)>.01){
        // Rounded sleeve overlap shares the elbow pivot. It stays above hair
        // and below the forearm texture, filling the exposed cut edge.
        set(armR);ctx.beginPath();ctx.ellipse(780,765,23,25,-.5,0,Math.PI*2);
        const cloth=ctx.createLinearGradient(760,745,800,785);cloth.addColorStop(0,'#414469');cloth.addColorStop(1,'#303353');ctx.fillStyle=cloth;ctx.fill();set(transforms.get(id));
      }
      if(id.startsWith('eye-')&&!explode.checked){const iris=rig.layers.find(l=>l.id==='iris-'+id.split('-')[1]);ctx.fillStyle='#fdfbff';trace(iris.shape);ctx.fill();}
      ctx.save();if(id.startsWith('iris-')&&!explode.checked){trace(rig.layers.find(l=>l.id==='eye-'+id.split('-')[1]).shape);ctx.clip();}
      if(id==='hand-right'&&motion==='happy'&&phase>.20&&phase<.85&&!explode.checked){
        ctx.translate(851,871);ctx.rotate(135*Math.PI/180);ctx.drawImage(peaceHand,-29,-66,58,70);
      }else imageAt(images.get(id),layer.bounds);ctx.restore();
      if(explode.checked&&document.querySelector('#labels').checked){ctx.font='15px system-ui';ctx.fillStyle='#245886';ctx.fillText(layer.name,layer.bounds[0],Math.max(15,layer.bounds[1]-6));}
    }
    flushBack();flushFront();if(!pitch)lids();
    if(active||action||(!reduced.matches&&!rest&&look.some((v,i)=>Math.abs(v-target[i])>.001)))schedule();
  }
  order.splice(order.indexOf('hand-right'),1);
  order.push('forearm-right','hand-right');
  wavePose.addEventListener('input',()=>{heldAction=null;heldWave=true;rest=false;action=null;playing.checked=false;explode.checked=false;target=[0,0];look=[0,0];status.textContent='挥手关节定格 '+wavePose.value+'%';schedule();});
  for(const [input,name]of[[nodPose,'nod'],[happyPose,'happy']])input.addEventListener('input',()=>{heldAction=name;heldWave=false;rest=false;action=null;playing.checked=false;explode.checked=false;target=[0,0];look=[0,0];status.textContent=names[name]+' '+input.value+'%';schedule();});
  document.querySelectorAll('[data-motion]').forEach(b=>b.addEventListener('click',()=>{heldWave=false;wavePose.value='0';trigger(b.dataset.motion);}));
  canvas.addEventListener('click',()=>trigger('happy'));canvas.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();trigger('happy');}});
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();target=[Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1)),Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1))];schedule();});canvas.addEventListener('pointerleave',()=>{target=[0,0];schedule();});
  playing.addEventListener('change',()=>{rest=false;last=0;status.textContent=playing.checked?'独立图层待机播放中':'待机已暂停';schedule();});follow.addEventListener('change',schedule);
  explode.addEventListener('change',()=>{action=null;rest=false;status.textContent=explode.checked?'拆层检查：22 个独立 PNG，可逐层关闭':'已恢复关节装配';schedule();});document.querySelector('#labels').addEventListener('change',schedule);
  document.querySelector('#rest').addEventListener('click',()=>{heldAction=null;heldWave=false;wavePose.value=nodPose.value=happyPose.value="0";rest=true;action=null;playing.checked=false;explode.checked=false;blinkPose.value=armPose.value=tailPose.value='0';look=[0,0];target=[0,0];status.textContent='统一图层装配 · 静态定格';schedule();});
  for(const input of[blinkPose,armPose,tailPose])input.addEventListener('input',()=>{heldAction=null;heldWave=false;rest=false;action=null;playing.checked=false;explode.checked=false;target=[0,0];look=[0,0];status.textContent='关节定格检查';schedule();});
  document.querySelector('#allLayers').addEventListener('click',()=>{rig.layers.forEach(l=>visible.add(l.id));document.querySelectorAll('[data-layer]').forEach(c=>c.checked=true);schedule();});
  document.querySelector('#dark').addEventListener('change',e=>document.querySelector('#stage').classList.toggle('dark',e.target.checked));document.querySelector('#size').addEventListener('change',e=>canvas.style.maxWidth=e.target.value+'px');
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else schedule();});reduced.addEventListener('change',()=>{action=null;last=0;schedule();});
  (async()=>{rig=await(await fetch('rig.json')).json();await Promise.all([...rig.layers.map(async l=>{images.set(l.id,await load(l.file));visible.add(l.id);}),...rig.seams.map(async s=>seams.set(s.id,await load(s.file)))]);
    waveBacking=await load('layers/wave-backing.png');peaceHand=await load('layers/hand-peace-chibi.png');
    const list=document.querySelector('#layerList');for(const l of rig.layers){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.layer=l.id;input.addEventListener('change',()=>{if(input.checked)visible.add(l.id);else visible.delete(l.id);schedule();});label.append(input,document.createTextNode(' '+l.name));list.append(label);}
    document.querySelector('#verification').textContent=`已导出 ${rig.layers.length} 个独立 PNG；重新读回并拼合后，${rig.verification.visiblePixels.toLocaleString()} 个可见像素的 RGBA 通道差异为 ${rig.verification.channelDifferences}。`;
    ready=true;canvas.dataset.renderer='segmented-canvas2d';canvas.dataset.layerCount=String(rig.layers.length);status.textContent='独立图层已装配 · 点击可回应';schedule();
  })().catch(error=>{status.textContent=error.message;console.error(error);});
})();

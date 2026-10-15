(() => {
  'use strict';
  const canvas = document.querySelector('#model'), status = document.querySelector('#status');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) { status.textContent = '当前浏览器无法创建 WebGL 预览。'; return; }
  const vertex = `precision mediump float; attribute vec2 point; varying vec2 uv;
    uniform float time, amount, nod, happy, tail; uniform vec2 look;
    float region(vec2 p,vec2 c,vec2 r){vec2 d=(p-c)/r;return exp(-dot(d,d)*2.0);}
    void main(){uv=point;vec2 p=point;float head=1.0-smoothstep(.44,.67,p.y);
      p.x+=look.x*.009*head;p.y+=look.y*.005*head;
      p.y-=sin(time*1.6)*.0025*amount*(1.0-smoothstep(.82,.98,p.y));
      p.x+=sin(time*1.1)*.0025*head*amount;
      float hair=region(p,vec2(.25,.62),vec2(.17,.22))+region(p,vec2(.73,.62),vec2(.14,.23));
      p.x+=sin(time*1.8+p.y*8.0)*.004*hair*amount;
      float fin=region(p,vec2(.85,.73),vec2(.18,.18));
      p.x+=sin(time*1.5)*(.005*amount+.018*tail)*fin;
      p.y+=cos(time*1.5)*(.003*amount+.009*tail)*fin;
      p.y+=nod*.012*head;p.y-=happy*.009*head;p.x+=happy*.006*sin(time*17.0)*head;
      gl_Position=vec4((p.x-.5)*1.84,(.5-p.y)*1.84,0,1);
    }`;
  const fragment = `precision mediump float; varying vec2 uv; uniform sampler2D art; uniform float blink;uniform vec2 look;
    void main(){vec2 p=uv;vec4 c=texture2D(art,p);
      for(int i=0;i<2;i++){vec2 center=vec2(i==0?.397:.547,.407);vec2 d=p-center;
        float inside=(1.0-smoothstep(.037,.048,abs(d.x)))*(1.0-smoothstep(.030,.040,abs(d.y)));
        if(inside>.0){float opening=max(.07,1.0-blink*.94);vec2 q=center+vec2(d.x-look.x*.002,d.y/opening);
          vec4 eye=texture2D(art,q);float keep=1.0-smoothstep(.031,.039,abs(d.y/opening));
          vec4 skin=vec4(.996,.932,.909,1.0);vec4 replacement=mix(skin,eye,keep);
          float lid=(1.0-smoothstep(.001,.0025,abs(d.y+.002+(.004*(1.0-pow(d.x/.045,2.0))))))*blink;
          replacement=mix(replacement,vec4(.23,.14,.19,1.0),lid);c=mix(c,replacement,inside*blink);}
      }gl_FragColor=c;
    }`;
  function shader(type, source) { const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s; }
  let program;
  try {program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));}catch(error){status.textContent='预览着色器加载失败：'+error.message;return;}
  gl.useProgram(program);
  const points=[],indices=[],cols=100,rows=100;
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)points.push(x/cols,y/rows);
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const a=y*(cols+1)+x;indices.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);}
  const positions=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,positions);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
  const attribute=gl.getAttribLocation(program,'point');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
  const elements=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  const uniform=Object.fromEntries(['time','amount','nod','happy','tail','look','blink','art'].map(name=>[name,gl.getUniformLocation(program,name)]));
  let ready=false,frame=0,last=0,elapsed=0,nextBlink=2.8,blinkStart=-10,action=null,actionAt=0,look=[0,0],target=[0,0];
  const playing=document.querySelector('#playing'),follow=document.querySelector('#follow'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function draw(now){frame=0;if(!ready||document.hidden)return;const dt=last?Math.min((now-last)/1000,.05):0;last=now;
    const active=playing.checked&&!reduced.matches;if(active)elapsed+=dt;
    if(active&&elapsed>=nextBlink){blinkStart=elapsed;nextBlink=elapsed+3.4+Math.random()*2.2;}
    look=look.map((value,i)=>value+(target[i]-value)*.12);
    const since=(now-actionAt)/1000,envelope=Math.max(0,Math.sin(Math.min(1,since/1.1)*Math.PI));
    if(since>1.1)action=null;
    const autoBlink=active?Math.max(0,1-Math.abs((elapsed-blinkStart-.11)/.11)):0;
    const manualBlink=action==='blink'?Math.max(0,1-Math.abs((since-.11)/.11)):0;
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uniform.time,elapsed);gl.uniform1f(uniform.amount,active?1:0);
    gl.uniform1f(uniform.nod,action==='nod'?envelope:0);gl.uniform1f(uniform.happy,action==='happy'?envelope:0);gl.uniform1f(uniform.tail,action==='tail'?envelope:0);
    gl.uniform2f(uniform.look,...(follow.checked&&!reduced.matches?look:[0,0]));gl.uniform1f(uniform.blink,Math.max(autoBlink,manualBlink));
    gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
    if(active||action||(!reduced.matches&&look.some((v,i)=>Math.abs(v-target[i])>.001)))schedule();
  }
  function schedule(){if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
  function trigger(name){if(reduced.matches){status.textContent='系统已开启减少动态效果。';return;}action=name;actionAt=performance.now();status.textContent=({blink:'眨眼',nod:'轻轻点头',happy:'开心回应',tail:'鲸尾轻摆'})[name];schedule();}
  document.querySelectorAll('[data-motion]').forEach(button=>button.addEventListener('click',()=>trigger(button.dataset.motion)));
  canvas.addEventListener('click',()=>trigger('happy'));canvas.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();trigger('happy');}});
  canvas.addEventListener('pointermove',event=>{const r=canvas.getBoundingClientRect();target=[Math.max(-1,Math.min(1,(event.clientX-r.left)/r.width*2-1)),Math.max(-1,Math.min(1,(event.clientY-r.top)/r.height*2-1))];schedule();});
  canvas.addEventListener('pointerleave',()=>{target=[0,0];schedule();});
  playing.addEventListener('change',()=>{last=0;status.textContent=playing.checked?'待机播放中':'已暂停待机';schedule();});follow.addEventListener('change',schedule);
  document.querySelector('#dark').addEventListener('change',event=>document.querySelector('#stage').classList.toggle('dark',event.target.checked));
  document.querySelector('#size').addEventListener('change',event=>canvas.style.maxWidth=event.target.value+'px');
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else schedule();});reduced.addEventListener('change',()=>{last=0;schedule();});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);frame=0;ready=false;status.textContent='图形上下文已中断，请刷新页面。';});
  const image=new Image();image.onload=()=>{const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.uniform1i(uniform.art,0);ready=true;status.textContent='待机播放中 · 点击形象可回应';schedule();};image.onerror=()=>status.textContent='校正版图片未能加载。';image.src='blue-maid-05-corrected-v2.png';
})();

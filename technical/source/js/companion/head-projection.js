// A shallow 2.5D head surface, rotated about X at the neck. Textures remain
// independently assembled; the projection changes depth, not head translation.
// Renders through a continuous per-pixel inverse warp (no strip drawImage),
// so perspective changes cannot alias into visible horizontal bands.
globalThis.CompanionHeadProjection={
  point(x,y,pitch,neck){
    const rx=x-neck[0],ry=y-neck[1];
    const dome=Math.sqrt(Math.max(0,1-((x-605)/340)**2-((y-365)/365)**2));
    const z=125*dome*Math.max(0,Math.min(1,(neck[1]-y)/80));
    const c=Math.cos(pitch),s=Math.sin(pitch),depth=-ry*s+z*(c-1);
    const perspective=1800/(1800-depth);
    return [neck[0]+rx*perspective,neck[1]+(ry*c+z*s)*perspective];
  },
  _buffers:typeof WeakMap==='function'?new WeakMap():null,
  paint(ctx,image,pitch,world,neck){
    if(Math.abs(pitch)<1e-6){ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(image,0,0);return;}
    const w=image.width,h=image.height;
    const inv=world.inverse();
    const anchorX=world.a*neck[0]+world.c*neck[1]+world.e;
    // Forward map for each canvas row: destination y and horizontal scale
    // about the projected neck x. Both vary smoothly with the row.
    const destY=new Float64Array(h),scaleAt=new Float64Array(h);
    for(let v=0;v<h;v++){
      const y=inv.b*anchorX+inv.d*v+inv.f;
      const p=this.point(neck[0],y,pitch,neck),side=this.point(neck[0]+1,y,pitch,neck);
      destY[v]=world.b*p[0]+world.d*p[1]+world.f;
      scaleAt[v]=Math.max(.2,side[0]-p[0]);
    }
    const minY=Math.max(0,Math.floor(destY[0])),maxY=Math.min(h-1,Math.ceil(destY[h-1]));
    if(maxY<=minY)return;
    // Invert destination y -> fractional canvas row once per frame.
    const lut=new Float32Array(maxY-minY+1);
    let vi=0;
    for(let Y=minY;Y<=maxY;Y++){
      while(vi<h-2&&destY[vi+1]<Y)vi++;
      const d=destY[vi+1]-destY[vi];
      lut[Y-minY]=vi+Math.min(1,Math.max(0,d>1e-6?(Y-destY[vi])/d:0));
    }
    const src=image.getContext('2d').getImageData(0,0,w,h).data;
    let buf=this._buffers&&this._buffers.get(image);
    if(!buf){
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      buf={canvas,ctx:canvas.getContext('2d'),pixels:null};
      if(this._buffers)this._buffers.set(image,buf);
    }
    if(!buf.pixels)buf.pixels=buf.ctx.createImageData(w,h);
    const out=buf.pixels.data;out.fill(0);
    // Source alpha bounds (coarse scan, then padded for thin antialiased edges).
    let bx0=w,bx1=-1,by0=h,by1=-1;
    for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
      if(src[(y*w+x)*4+3]){if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y;}
    }
    if(bx1<0)return;
    bx0=Math.max(0,bx0-12);bx1=Math.min(w-1,bx1+12);
    by0=Math.max(minY,by0-12);by1=Math.min(maxY,by1+12);
    const scMin=scaleAt[Math.max(0,Math.floor(lut[by0-minY]))],scMax=scaleAt[Math.min(h-1,Math.ceil(lut[by1-minY]))];
    const xs=[anchorX+(bx0-anchorX)*scMin,anchorX+(bx0-anchorX)*scMax,anchorX+(bx1-anchorX)*scMin,anchorX+(bx1-anchorX)*scMax];
    const cx0=Math.max(0,Math.floor(Math.min(...xs))),cx1=Math.min(w-1,Math.ceil(Math.max(...xs)));
    for(let Y=by0;Y<=by1;Y++){
      const vf=lut[Y-minY],v0=Math.floor(vf),v1=Math.min(h-1,v0+1),fy=vf-v0;
      const scale=scaleAt[v0]+(scaleAt[v1]-scaleAt[v0])*fy,invScale=1/scale;
      const r0=v0*w,r1=v1*w;
      for(let X=cx0;X<=cx1;X++){
        const sx=anchorX+(X-anchorX)*invScale;
        if(sx<0||sx>=w-1)continue;
        const x0=sx|0,x1=Math.min(w-1,x0+1),fx=sx-x0;
        const p00=(r0+x0)*4,p10=(r0+x1)*4,p01=(r1+x0)*4,p11=(r1+x1)*4;
        const w00=(1-fx)*(1-fy),w10=fx*(1-fy),w01=(1-fx)*fy,w11=fx*fy;
        const a00=src[p00+3],a10=src[p10+3],a01=src[p01+3],a11=src[p11+3];
        const a=a00*w00+a10*w10+a01*w01+a11*w11;
        if(a<.5)continue;
        const o=(Y*w+X)*4;
        out[o]=(src[p00]*a00*w00+src[p10]*a10*w10+src[p01]*a01*w01+src[p11]*a11*w11)/a;
        out[o+1]=(src[p00+1]*a00*w00+src[p10+1]*a10*w10+src[p01+1]*a01*w01+src[p11+1]*a11*w11)/a;
        out[o+2]=(src[p00+2]*a00*w00+src[p10+2]*a10*w10+src[p01+2]*a01*w01+src[p11+2]*a11*w11)/a;
        out[o+3]=a;
      }
    }
    buf.ctx.putImageData(buf.pixels,0,0);
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(buf.canvas,0,0);ctx.restore();
  }
};

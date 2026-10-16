// A shallow 2.5D head surface, rotated about X at the neck. Textures remain
// independently assembled; the projection changes depth, not head translation.
globalThis.CompanionHeadProjection={
  point(x,y,pitch,neck){
    const rx=x-neck[0],ry=y-neck[1];
    const dome=Math.sqrt(Math.max(0,1-((x-605)/340)**2-((y-365)/365)**2));
    const z=125*dome*Math.max(0,Math.min(1,(neck[1]-y)/80));
    const c=Math.cos(pitch),s=Math.sin(pitch),depth=-ry*s+z*(c-1);
    const perspective=1800/(1800-depth);
    return [neck[0]+rx*perspective,neck[1]+(ry*c+z*s)*perspective];
  },
  paint(ctx,image,pitch,world,neck){
    if(Math.abs(pitch)<1e-6){ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(image,0,0);return;}
    const inv=world.inverse(),w=image.width,h=image.height;
    // Project narrow texture rows onto the curved sagittal cross-section.
    // Continuous rows avoid alpha seams from overlapping texture triangles.
    const anchorX=world.a*neck[0]+world.c*neck[1]+world.e;
    const row=v=>{
      const y=inv.b*anchorX+inv.d*v+inv.f;
      const p=this.point(neck[0],y,pitch,neck),side=this.point(neck[0]+1,y,pitch,neck);
      return {y:world.b*p[0]+world.d*p[1]+world.f,scale:side[0]-p[0]};
    };
    ctx.save();ctx.setTransform(1,0,0,1,0,0);
    for(let v=0;v<h;v+=2){
      const a=row(v),b=row(Math.min(v+2,h)),height=Math.max(.01,b.y-a.y);
      ctx.drawImage(image,0,v,w,Math.min(2,h-v),anchorX+(0-anchorX)*a.scale,a.y,w*a.scale,height+.08);
    }
    ctx.restore();

  }
};

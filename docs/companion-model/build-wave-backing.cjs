// Extract only the newly painted occluded region; never replace the approved face/body.
const fs=require('node:fs/promises'),path=require('node:path');
const sharp=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
(async()=>{
  const root=__dirname,rig=JSON.parse(await fs.readFile(path.join(root,'rig.json'),'utf8'));
  const saved=path.join(root,'wave-occlusion-cleanplate.png');
  const input=process.argv[2]||saved;
  if(path.resolve(input)!==saved)await fs.copyFile(input,saved);
  const w=rig.width,h=rig.height,mask=new Uint8Array(w*h);
  // Only reconstruct pixels originally occluded by the moving limb. The
  // approved visible hair is never replaced by generated hair.
  for(const id of ['arm-right','forearm-right','hand-right']){
    const l=rig.layers.find(l=>l.id===id),{data,info}=await sharp(path.join(root,l.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3])mask[(y+l.bounds[1])*w+x+l.bounds[0]]=1;
  }
  const rgba=await sharp(input).resize(w,h,{fit:'fill'}).ensureAlpha().raw().toBuffer();
  for(let p=0;p<mask.length;p++)if(!mask[p])rgba.fill(0,p*4,p*4+4);
  await sharp(rgba,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(root,'layers/wave-backing.png'));
  console.log('Exported hidden hair only inside the original arm occlusion; original visible hair preserved.');
})().catch(e=>{console.error(e);process.exitCode=1;});

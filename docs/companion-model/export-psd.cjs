const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require(process.env.BLOG_SHARP_MODULE||'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const {writePsdBuffer,readPsd,initializeCanvas}=require('./tools/node_modules/ag-psd');
initializeCanvas(()=>{throw Error('Unexpected canvas path; this exporter uses raw RGBA.');},(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
const root=__dirname;
async function bitmap(file){const {data,info}=await sharp(path.join(root,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,data:new Uint8ClampedArray(data)};}
(async()=>{
  const rig=JSON.parse(await fs.readFile(path.join(root,'rig.json'),'utf8'));
  const children=[];
  for(const layer of rig.layers)children.push({name:layer.id+' · '+layer.name,left:layer.bounds[0],top:layer.bounds[1],imageData:await bitmap(layer.file)});
  const source={name:'原图像素拆层（22层）',opened:true,children};
  const repairs={name:'接缝补量（非完整遮挡补绘）',hidden:true,opened:false,children:[]};
  repairs.children.push({name:'wave-occlusion · 抬臂后方发束补绘',left:0,top:0,imageData:await bitmap('layers/wave-backing.png')});
  repairs.children.push({name:'peace-hand · 短圆Q版比耶手型（局部坐标）',left:0,top:0,imageData:await bitmap('layers/hand-peace-chibi.png')});
  for(const seam of rig.seams)repairs.children.push({name:seam.id+' seam',left:seam.bounds[0],top:seam.bounds[1],imageData:await bitmap(seam.file)});
  const psd={width:rig.width,height:rig.height,imageData:await bitmap(rig.source),children:[repairs,source]};
  const output=path.join(root,'blue-maid-05-layered-v1.psd');
  await fs.writeFile(output,writePsdBuffer(psd));
  const decoded=readPsd(await fs.readFile(output),{useImageData:true,skipThumbnail:true});
  const returned=decoded.children.find(group=>group.name===source.name).children;
  if(returned.length!==rig.layers.length)throw Error('PSD lost source layers');
  let mismatched=0;
  for(let i=0;i<children.length;i++){
    const actual=returned[i],expected=children[i];
    if(actual.left!==expected.left||actual.top!==expected.top||actual.name!==expected.name)throw Error('PSD layer metadata mismatch');
    if(actual.imageData.data.length!==expected.imageData.data.length)throw Error('PSD image dimensions mismatch');
    for(let p=0;p<expected.imageData.data.length;p++)if(actual.imageData.data[p]!==expected.imageData.data[p])mismatched++;
  }
  if(mismatched)throw Error('PSD pixel roundtrip failed: '+mismatched);
  const result={sourceLayers:returned.length,seamLayers:rig.seams.length,width:decoded.width,height:decoded.height,channelDifferences:mismatched,checkedWith:'ag-psd write/read roundtrip; not Cubism Editor import verification'};
  await fs.writeFile(path.join(root,'layers','psd-check.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;});

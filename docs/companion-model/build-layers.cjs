/* Deterministic source-pixel separation. No redraw or deformation of the source. */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.BLOG_SHARP_MODULE || 'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = __dirname;
const poly = (...points) => ({ polygon: points });
const ellipse = (cx,cy,rx,ry) => ({ ellipse: [cx,cy,rx,ry] });
const definitions = [
  {id:'body',name:'躯干底层',parent:'torso',pivot:[.48,.64],shape:poly([0,0],[1,0],[1,1],[0,1])},
  {id:'tail',name:'鲸尾',parent:'torso',pivot:[.72,.83],shape:poly([.80,.58],[.90,.57],[.98,.65],[.98,.91],[.72,.94],[.65,.85],[.75,.79],[.79,.72])},
  {id:'skirt',name:'裙摆与围裙下部',parent:'torso',pivot:[.48,.65],shape:poly([.37,.65],[.61,.65],[.75,.82],[.72,.88],[.23,.88],[.19,.78])},
  {id:'leg-left',name:'左侧短袜与鞋',parent:'root',pivot:[.43,.86],shape:poly([.36,.87],[.47,.87],[.48,1],[.35,1])},
  {id:'leg-right',name:'右侧短袜与鞋',parent:'root',pivot:[.52,.86],shape:poly([.48,.87],[.60,.87],[.61,1],[.48,1])},
  {id:'head',name:'头部与脸底',parent:'headGroup',pivot:[.48,.49],shape:poly([0,0],[1,0],[1,.49],[.65,.49],[.57,.51],[.38,.51],[.30,.49],[0,.49])},
  {id:'hair-left',name:'左侧后发束',parent:'headGroup',pivot:[.31,.39],shape:poly([.17,.38],[.32,.40],[.37,.48],[.33,.57],[.36,.65],[.28,.71],[.10,.69],[.10,.49])},
  {id:'hair-right',name:'右侧后发束',parent:'headGroup',pivot:[.65,.38],shape:poly([.65,.38],[.80,.40],[.85,.58],[.81,.69],[.72,.72],[.64,.67],[.64,.59],[.62,.49])},
  {id:'arm-left',name:'左侧长袖上臂',parent:'armLeftGroup',pivot:[.37,.55],shape:poly([.35,.52],[.42,.55],[.37,.65],[.30,.71],[.24,.68],[.29,.59])},
  {id:'arm-right',name:'右侧长袖上臂',parent:'armRightGroup',pivot:[.60,.55],shape:poly([.57,.53],[.64,.52],[.70,.63],[.71,.70],[.66,.73],[.59,.65])},
  {id:'hand-left',name:'左侧袖口与手',parent:'handLeftGroup',pivot:[.28,.69],shape:poly([.25,.66],[.31,.69],[.30,.74],[.22,.76],[.18,.72])},
  {id:'hand-right',name:'右侧袖口与手',parent:'handRightGroup',pivot:[.68,.70],shape:poly([.65,.67],[.71,.66],[.76,.72],[.75,.77],[.66,.75])},
  {id:'bangs',name:'前额刘海',parent:'headGroup',pivot:[.48,.21],shape:poly([.34,.19],[.62,.19],[.66,.29],[.64,.35],[.61,.37],[.57,.36],[.54,.395],[.50,.385],[.47,.40],[.43,.36],[.39,.35],[.36,.39],[.33,.35],[.31,.29])},
  {id:'fin-left',name:'左鲸鳍耳',parent:'headGroup',pivot:[.28,.37],shape:poly([.24,.33],[.29,.38],[.27,.44],[.13,.44],[.13,.39])},
  {id:'fin-right',name:'右鲸鳍耳',parent:'headGroup',pivot:[.68,.36],shape:poly([.68,.33],[.75,.36],[.85,.42],[.84,.44],[.69,.44],[.66,.40])},
  {id:'ahoge',name:'呆毛',parent:'headGroup',pivot:[.46,.105],shape:poly([.27,0],[.53,0],[.53,.10],[.45,.115],[.39,.09],[.27,.09])},
  {id:'eye-left',name:'左眼白与眼睑',parent:'eyeLeftGroup',pivot:[.397,.407],shape:ellipse(.397,.407,.047,.043)},
  {id:'eye-right',name:'右眼白与眼睑',parent:'eyeRightGroup',pivot:[.547,.407],shape:ellipse(.547,.407,.047,.043)},
  {id:'iris-left',name:'左瞳孔',parent:'eyeLeftGroup',pivot:[.397,.411],shape:ellipse(.397,.411,.024,.029)},
  {id:'iris-right',name:'右瞳孔',parent:'eyeRightGroup',pivot:[.547,.411],shape:ellipse(.547,.411,.024,.029)},
  {id:'mouth',name:'口型',parent:'headGroup',pivot:[.475,.463],shape:ellipse(.475,.463,.027,.022)}
];
function contains(shape,x,y){
  if(shape.ellipse){const[cx,cy,rx,ry]=shape.ellipse;return ((x-cx)/rx)**2+((y-cy)/ry)**2<=1;}
  const p=shape.polygon;let inside=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])inside=!inside;
  return inside;
}
(async()=>{
  const {data,info}=await sharp(path.join(root,'blue-maid-05-corrected-v2.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=info;
  const buffers=definitions.map(()=>Buffer.alloc(width*height*4));
  const bounds=definitions.map(()=>[width,height,0,0]);
  const assignment=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const offset=(y*width+x)*4;if(!data[offset+3])continue;
    let part=0;for(let i=1;i<definitions.length;i++)if(contains(definitions[i].shape,(x+.5)/width,(y+.5)/height))part=i;
    data.copy(buffers[part],offset,offset,offset+4);assignment[y*width+x]=part;
    const b=bounds[part];b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x+1);b[3]=Math.max(b[3],y+1);
  }
  const output=path.join(root,'layers');await fs.mkdir(output,{recursive:true});
  const repairs=[];
  async function save(buffer,b,id){
    if(b[2]<=b[0]||b[3]<=b[1])throw Error('Empty layer: '+id);
    await sharp(buffer,{raw:{width,height,channels:4}}).extract({left:b[0],top:b[1],width:b[2]-b[0],height:b[3]-b[1]}).png().toFile(path.join(output,id+'.png'));
  }
  for(let i=0;i<definitions.length;i++){
    await save(buffers[i],bounds[i],definitions[i].id);
    // Small hidden seam allowances. These do not reconstruct large occluded anatomy.
    const visited=new Uint8Array(width*height),distance=new Uint8Array(width*height),repair=Buffer.alloc(width*height*4),queue=new Int32Array(width*height);
    let first=0,end=0;const b=bounds[i],rb=[width,height,0,0];
    for(let y=b[1];y<b[3];y++)for(let x=b[0];x<b[2];x++){const p=y*width+x;if(buffers[i][p*4+3]){visited[p]=1;queue[end++]=p;}}
    const edge=Buffer.from(buffers[i]);
    while(first<end){const p=queue[first++];if(distance[p]>=10)continue;const x=p%width,y=Math.floor(p/width);
      for(const n of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1]){
        if(n<0||visited[n]||data[n*4+3]!==255)continue;visited[n]=1;distance[n]=distance[p]+1;queue[end++]=n;
        edge.copy(edge,n*4,p*4,p*4+4);edge[n*4+3]=255;edge.copy(repair,n*4,n*4,n*4+4);
        const nx=n%width,ny=Math.floor(n/width);rb[0]=Math.min(rb[0],nx);rb[1]=Math.min(rb[1],ny);rb[2]=Math.max(rb[2],nx+1);rb[3]=Math.max(rb[3],ny+1);
      }
    }
    if(rb[2]>rb[0]){await save(repair,rb,definitions[i].id+'-seam');repairs.push({id:definitions[i].id,file:'layers/'+definitions[i].id+'-seam.png',bounds:rb});}
  }
  // Reopen exported PNGs and reconstruct at original coordinates, then compare RGBA.
  const rebuilt=Buffer.alloc(data.length),coverage=new Uint8Array(width*height);
  for(let i=0;i<definitions.length;i++){
    const layer=await sharp(path.join(output,definitions[i].id+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});const b=bounds[i];
    for(let y=0;y<layer.info.height;y++)for(let x=0;x<layer.info.width;x++){const src=(y*layer.info.width+x)*4,dst=((b[1]+y)*width+b[0]+x)*4;if(!layer.data[src+3])continue;if(coverage[dst/4]++)throw Error('Layers overlap');layer.data.copy(rebuilt,dst,src,src+4);}
  }
  let different=0,opaque=0;
  for(let i=0;i<width*height;i++)if(data[i*4+3]){opaque++;for(let c=0;c<4;c++)if(rebuilt[i*4+c]!==data[i*4+c])different++;}
  if(different)throw Error('Source reconstruction failed');
  await sharp(rebuilt,{raw:{width,height,channels:4}}).png().toFile(path.join(output,'reconstructed.png'));
  const rig={version:1,source:'blue-maid-05-corrected-v2.png',width,height,kind:'segmented-2d-puppet',notCubism:true,layers:definitions.map((d,i)=>({...d,file:'layers/'+d.id+'.png',bounds:bounds[i]})),seams:repairs,verification:{visiblePixels:opaque,channelDifferences:different,method:'reopened all exported PNGs, reconstructed at source coordinates and compared visible RGBA; excludes seam underlays'}};
  await fs.writeFile(path.join(root,'rig.json'),JSON.stringify(rig,null,2)+'\n');
  await fs.writeFile(path.join(output,'reconstruction-check.json'),JSON.stringify(rig.verification,null,2)+'\n');
  console.log(JSON.stringify({layers:definitions.length,width,height,...rig.verification}));
})().catch(error=>{console.error(error);process.exitCode=1;});

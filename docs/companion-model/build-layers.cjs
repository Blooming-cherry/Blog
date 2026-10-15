/* Deterministic source-pixel separation. No redraw or deformation of the source. */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.BLOG_SHARP_MODULE || 'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = __dirname;
const poly = (...points) => ({ polygon: points });
const ellipse = (cx,cy,rx,ry) => ({ ellipse: [cx,cy,rx,ry] });
const pxpoly=(...points)=>poly(...points.map(([x,y])=>[x/1262,y/1246]));
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
// Source-coordinate contour traces. Keep joints on actual garment / hair boundaries.
const contours={
 tail:pxpoly([985,813],[1013,788],[1048,759],[1075,739],[1096,717],[1110,724],[1125,759],[1137,801],[1138,834],[1129,866],[1110,895],[1086,914],[1056,933],[1043,964],[1031,995],[1012,1024],[985,1048],[949,1068],[904,1083],[856,1087],[811,1083],[784,1074],[805,1053],[843,1034],[869,1010],[889,984],[899,966],[926,965],[958,958],[982,949],[1000,935],[1001,927],[983,919],[965,909],[947,896],[937,882],[933,862],[943,841],[960,826]),
 skirt:pxpoly([493,795],[697,795],[726,820],[755,850],[789,883],[826,918],[855,947],[895,983],[895,1007],[879,1031],[844,1054],[805,1074],[766,1083],[715,1090],[663,1090],[610,1092],[550,1090],[502,1090],[460,1084],[414,1075],[370,1055],[333,1037],[309,1014],[286,983],[290,971],[314,955],[329,934],[351,907],[375,886],[397,861],[424,836],[453,814]),
 'leg-left':pxpoly([485,1090],[577,1090],[583,1240],[478,1240]),
 'leg-right':pxpoly([615,1090],[710,1090],[714,1240],[609,1240]),
 head:pxpoly([0,0],[1262,0],[1262,618],[0,618]),
 'hair-left':pxpoly([324,505],[350,541],[382,563],[398,580],[414,611],[443,633],[458,657],[450,681],[438,704],[414,719],[395,741],[381,767],[357,789],[345,825],[328,842],[310,852],[276,856],[243,871],[212,864],[193,848],[189,824],[190,800],[176,769],[176,741],[193,712],[231,690],[225,669],[219,651],[230,626],[257,601],[290,576],[310,546]),
 'hair-right':pxpoly([865,510],[866,548],[889,578],[920,607],[952,631],[980,645],[1001,668],[993,694],[1017,721],[1032,745],[1023,770],[1002,787],[1006,809],[996,840],[985,857],[963,875],[938,885],[918,873],[891,866],[865,839],[856,809],[836,779],[823,750],[810,726],[787,716],[767,702],[754,681],[752,656],[769,626],[787,608],[809,589],[828,564],[843,539]),
 'arm-left':pxpoly([478,640],[482,672],[487,701],[479,733],[464,766],[448,791],[425,816],[399,844],[358,829],[331,812],[343,790],[365,774],[385,753],[398,724],[415,699],[439,687],[446,667],[461,649]),
 'arm-right':pxpoly([719,644],[738,663],[752,681],[775,700],[790,731],[805,752],[831,773],[850,795],[855,820],[832,840],[803,848],[775,822],[752,791],[738,756],[724,720],[713,680]),
 'hand-left':pxpoly([330,817],[346,824],[361,835],[382,845],[398,853],[389,867],[370,878],[354,889],[342,920],[326,924],[310,918],[310,906],[296,914],[280,914],[280,902],[266,902],[256,895],[264,883],[284,872],[300,865],[313,851]),
 'hand-right':pxpoly([823,819],[843,821],[859,842],[868,859],[884,872],[911,882],[925,894],[923,902],[901,899],[904,910],[888,912],[881,903],[877,919],[864,919],[850,904],[840,889],[823,880],[807,865],[799,849]),
 bangs:pxpoly([490,210],[620,210],[646,255],[665,350],[655,416],[620,463],[643,483],[612,483],[600,493],[560,490],[580,475],[550,450],[525,400],[512,355],[490,370],[475,400],[468,360],[475,300]),
 'fin-left':pxpoly([306,400],[313,428],[305,448],[312,480],[333,492],[329,513],[300,519],[285,521],[265,515],[248,521],[230,518],[210,518],[193,513],[193,500],[226,479],[257,452],[287,421]),
 'fin-right':pxpoly([870,406],[900,421],[933,440],[980,480],[1046,514],[1038,524],[1016,527],[994,522],[981,530],[961,528],[944,531],[925,526],[906,528],[883,518],[868,507]),
 ahoge:pxpoly([398,108],[414,80],[455,47],[510,24],[550,20],[581,30],[602,53],[613,82],[610,110],[595,132],[588,128],[591,102],[586,85],[566,65],[538,57],[501,60],[466,72],[430,94],[410,110]),
 'eye-left':pxpoly([425,493],[434,474],[447,456],[463,447],[483,445],[501,447],[520,455],[536,468],[547,486],[545,511],[535,529],[520,540],[502,546],[481,545],[462,539],[447,527],[437,511]),
 'eye-right':pxpoly([648,483],[654,463],[673,448],[691,443],[711,445],[730,455],[746,468],[763,490],[765,502],[750,513],[740,530],[719,543],[697,548],[676,544],[661,535],[649,517]),
 'iris-left':pxpoly([500,465],[517,470],[531,483],[536,503],[535,520],[526,534],[515,541],[499,544],[481,538],[469,524],[466,508],[469,489],[479,475]),
 'iris-right':pxpoly([688,465],[705,469],[719,482],[726,500],[725,518],[718,533],[707,541],[691,545],[677,540],[665,530],[661,514],[664,495],[673,478])
};
for(const layer of definitions)if(contours[layer.id])layer.shape=contours[layer.id];
// Split the long sleeve at its anatomical elbow. The cuff belongs to the
// forearm; only the skin beyond the cuff belongs to the wrist joint.
definitions.splice(definitions.findIndex(l=>l.id==='hand-right'),0,{
  id:'forearm-right',name:'右前臂长袖与袖口',parent:'forearmRightGroup',pivot:[780/1262,765/1246],
  shape:pxpoly([737,758],[791,737],[811,755],[841,781],[858,813],[858,831],[882,852],[847,881],[816,873],[795,848],[768,823],[749,791])
});
definitions.find(l=>l.id==='hand-right').shape=pxpoly([849,867],[866,856],[884,872],[911,882],[925,894],[923,902],[901,899],[904,910],[888,912],[881,903],[877,919],[864,919],[850,904],[840,889],[830,882]);
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
    const selected=definitions[part].id,r=data[offset],g=data[offset+1],b=data[offset+2];
    if((selected.startsWith('hair-')||selected==='bangs')&&r>170&&r>g*1.03&&r>b*1.03)part=definitions.findIndex(l=>l.id==='head');
    if(selected.startsWith('arm-')&&b>140&&g>80&&b>r*1.5)part=definitions.findIndex(l=>l.id===selected.replace('arm-','hair-'));
    assignment[y*width+x]=part;
  }
  // Assign small contour leftovers to the nearest traced anatomical layer, rather than
  // leaving disconnected hair/tail pieces in the torso image.
  const torso=pxpoly([440,610],[755,610],[760,800],[700,824],[492,824],[430,800]);
  const nearest=Uint8Array.from(assignment),visited=new Uint8Array(width*height),queue=new Int32Array(width*height);let first=0,end=0;
  for(let i=0;i<nearest.length;i++)if(nearest[i]){visited[i]=1;queue[end++]=i;}
  while(first<end){const p=queue[first++],x=p%width,y=Math.floor(p/width);for(const n of[x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1])if(n>=0&&!visited[n]){visited[n]=1;nearest[n]=nearest[p];queue[end++]=n;}}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*width+x,offset=p*4;if(!data[offset+3])continue;
    if(!assignment[p]&&!contains(torso,(x+.5)/width,(y+.5)/height))assignment[p]=nearest[p];
    let part=assignment[p];
    if(contains(contours['hand-right'],(x+.5)/width,(y+.5)/height)){
      part=definitions.findIndex(l=>l.id===(y>871-(x-851)*.6?'hand-right':'forearm-right'));
    }
    if(definitions[part].id==='arm-right'&&y>765-(x-780)*.35)part=definitions.findIndex(l=>l.id==='forearm-right');
    data.copy(buffers[part],offset,offset,offset+4);
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
        if(n<0||visited[n]||data[n*4+3]<245)continue;visited[n]=1;distance[n]=distance[p]+1;queue[end++]=n;
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
  const groups={root:{parent:null,pivot:[.5,.95]},torso:{parent:'root',pivot:[.48,.65]},headGroup:{parent:'torso',pivot:[.48,.505]},armLeftGroup:{parent:'torso',pivot:[.377,.525]},armRightGroup:{parent:'torso',pivot:[.578,.525]},handLeftGroup:{parent:'armLeftGroup',pivot:[.28,.69]},handRightGroup:{parent:'armRightGroup',pivot:[.68,.70]},eyeLeftGroup:{parent:'headGroup',pivot:[.397,.407]},eyeRightGroup:{parent:'headGroup',pivot:[.547,.407]}};
  groups.forearmRightGroup={parent:'armRightGroup',pivot:[780/1262,765/1246]};
  groups.handRightGroup={parent:'forearmRightGroup',pivot:[851/1262,871/1246]};
  const actions={blink:{seconds:.24},nod:{seconds:1.35},wave:{seconds:3.2},happy:{seconds:1.35},tail:{seconds:1.35}};
  const rig={version:1,source:'blue-maid-05-corrected-v2.png',width,height,kind:'segmented-2d-puppet',notCubism:true,groups,actions,layers:definitions.map((d,i)=>({...d,file:'layers/'+d.id+'.png',bounds:bounds[i]})),seams:repairs,verification:{visiblePixels:opaque,channelDifferences:different,method:'reopened all exported PNGs, reconstructed at source coordinates and compared visible RGBA; excludes seam underlays'}};
  await fs.writeFile(path.join(root,'rig.json'),JSON.stringify(rig,null,2)+'\n');
  await fs.writeFile(path.join(output,'reconstruction-check.json'),JSON.stringify(rig.verification,null,2)+'\n');
  console.log(JSON.stringify({layers:definitions.length,width,height,...rig.verification}));
})().catch(error=>{console.error(error);process.exitCode=1;});

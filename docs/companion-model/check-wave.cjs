const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const rig=JSON.parse(fs.readFileSync(path.join(__dirname,'rig.json'),'utf8'));
assert.equal(rig.groups.forearmRightGroup.parent,'armRightGroup');
assert.equal(rig.groups.handRightGroup.parent,'forearmRightGroup');
for(const id of ['arm-right','forearm-right','hand-right']){
  const layer=rig.layers.find(l=>l.id===id);
  assert(layer,`Missing ${id}`);
  assert(fs.statSync(path.join(__dirname,layer.file)).size>100);
}
const js=fs.readFileSync(path.join(__dirname,'motion-preview.js'),'utf8');
const fn=js.slice(js.indexOf('  const smooth='),js.indexOf('  const reduced='));
const sample=Function(fn+';return waveJoints;')();
for(const endpoint of [0,1])for(const value of Object.values(sample(endpoint)))assert(Math.abs(value)<1e-9);
assert(sample(.5).elbow < -90,'A raised wave must bend the elbow');
assert(sample(.24).head>1,'Wave should incline the head to one side');
assert(sample(.58).head< -1,'Wave should incline the head to the other side');
assert(!rig.actions.nod,'Removed nod must not remain in the rig actions');
assert(!fs.readFileSync(path.join(__dirname,'motion-preview.html'),'utf8').includes('data-motion="nod"'),'Removed nod must not remain in the UI');
for(let i=1;i<=320;i++){
  const a=sample((i-1)/320),b=sample(i/320);
  for(const key of Object.keys(a))assert(Math.abs(a[key]-b[key])<4,'Joint discontinuity: '+key);
}
console.log('Wave: shoulder -> elbow -> wrist hierarchy, bidirectional head sway, removed nod, neutral endpoints and continuous joint angles verified.');

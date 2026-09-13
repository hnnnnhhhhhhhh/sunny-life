import * as THREE from 'three';
import { onFloor } from './architecture.js';

const KEYS=[
  [0,'#182638','#89a4d0','#546273',.18,.36,1],
  [300,'#243a51','#abc0dc','#626d74',.22,.42,1],
  [360,'#e8bba8','#ffd7af','#a0917b',.9,.9,.65],
  [450,'#b9d5df','#fff0d2','#889980',2.5,1.45,0],
  [720,'#c4d7d3','#fff0d5','#82977b',3.1,1.65,0],
  [1020,'#b8cdd6','#ffe1bc','#8d927c',2.5,1.4,0],
  [1110,'#dba897','#ffbd8a','#8d8183',1.35,.95,.3],
  [1170,'#776d86','#e7bfbd','#626780',.38,.53,.85],
  [1230,'#1e3048','#94afd8','#536477',.18,.36,1],
  [1440,'#182638','#89a4d0','#546273',.18,.36,1],
];
export function daylightAt(minutes) {
  const time=((Number.isFinite(minutes)?minutes:720)%1440+1440)%1440;
  const index=KEYS.findIndex(key=>key[0]>time),a=KEYS[index-1],b=KEYS[index];
  const t=THREE.MathUtils.smoothstep(time,a[0],b[0]);
  const mix=i=>THREE.MathUtils.lerp(a[i],b[i],t);
  const color=i=>new THREE.Color(a[i]).lerp(new THREE.Color(b[i]),t);
  const angle=(time/1440-.25)*Math.PI*2;
  const sunPosition=new THREE.Vector3(-Math.cos(angle)*28,Math.max(4,Math.sin(angle)*32),13);
  return {time,sky:color(1),sunColor:color(2),ground:color(3),sun:mix(4),ambient:mix(5),lamps:mix(6),
    sunPosition,daylight:1-mix(6),phase:time<330||time>=1200?'night':time<450?'dawn':time<1080?'day':'dusk'};
}

export function createHomeLighting(home, floorAt) {
  const root=new THREE.Group();root.name='HomeLighting';
  const lights=[],glows=[],ceiling=[];
  const add=(x,y,z,power,range,color='#ffdaa4')=>{
    const light=new THREE.PointLight(color,0,range,1.4);
    light.position.set(x,y,z);root.add(light);lights.push({light,power});
    const glow=new THREE.Mesh(new THREE.SphereGeometry(.085,8,6),
      new THREE.MeshStandardMaterial({color:'#fff2cf',emissive:color,emissiveIntensity:0}));
    glow.position.copy(light.position);glow.userData.disposable=glow.userData.ownMaterial=true;
    root.add(glow);glows.push(glow);
    return glow;
  };
  for(const object of home.furniture) {
    if(object.type==='lamp')add(object.x,floorAt(object.x,object.z)+1.62,object.z,4.8,7);
    if(object.type==='nightstand')add(object.x,floorAt(object.x,object.z)+.94,object.z,2.3,5);
  }
  // Fixed ceiling fixtures keep the room usable even when movable lamps are sold.
  for(const [x,z] of [[-3,1],[3,-2]]) {
    if(!onFloor(home,x,z))continue;
    const y=floorAt(x,z)+2.82;
    ceiling.push(add(x,y,z,5.2,10));
    const shade=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.07,16),
      new THREE.MeshStandardMaterial({color:'#e3e8e1',roughness:.85}));
    shade.position.set(x,y+.055,z);shade.userData.disposable=shade.userData.ownMaterial=true;root.add(shade);
    ceiling.push(shade);
  }
  return {root,update(amount){
    for(const {light,power} of lights){
      light.intensity=power*amount;
      light.visible=amount>0;
    }
    for(const glow of glows)glow.material.emissiveIntensity=amount*2.5;
  },setCeilingVisible(visible){for(const mesh of ceiling)mesh.visible=visible;},
  diagnostics(){return lights.map(({light})=>({position:light.position.toArray(),intensity:light.intensity}));}};
}

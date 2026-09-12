import * as THREE from 'three';
import { findPath, surfaceHeight } from './game.js';
import { layout, terrainSurface } from './terrain.js';

export const FISHING_SPOTS = [
  { id:'home-shore', name:'橡树湾', x:-4, z:10, water:{x:-4,z:13.5} },
  { id:'camp-shore', name:'营地浅滩', x:-4, z:17.5, water:{x:-4,z:14.4} },
  { id:'park-shore', name:'月湾海岸', x:24.5, z:13.5, water:{x:25,z:17.5} },
];
export const FISH = [
  { id:'silver', name:'银鳞鱼', color:'#a4c7c4', value:45 },
  { id:'perch', name:'青背鲈鱼', color:'#78a487', value:70 },
  { id:'golden', name:'金鳍鱼', color:'#e6b56c', value:110 },
];

export function planFishing(home, id, from, grid) {
  const spot = FISHING_SPOTS.find(s => s.id === id);
  if (!spot || terrainSurface(spot.water.x,spot.water.z).kind !== 'water') return { error:'这个钓点暂时不可用' };
  const path = findPath(home,from,spot,grid), end=path.at(-1);
  if (!end || Math.hypot(end.x-spot.x,end.z-spot.z)>0.55) return { error:'暂时无法走到钓点' };
  return { spot, path, approach:end, floor:surfaceHeight(home,end.x,end.z),
    rotation:Math.atan2(spot.water.x-end.x,spot.water.z-end.z) };
}

export function createFishingProps(catchIndex) {
  const group = new THREE.Group(), geometries=[], materials=[];
  const make = (geometry, color) => {
    const material=new THREE.MeshStandardMaterial({color,roughness:0.65,flatShading:true});
    const mesh=new THREE.Mesh(geometry,material);
    geometries.push(geometry); materials.push(material); group.add(mesh); return mesh;
  };
  const rod=make(new THREE.CylinderGeometry(0.018,0.03,1,7),'#755442');
  const grip=make(new THREE.CylinderGeometry(0.04,0.04,0.24,8),'#354f56');
  const reel=make(new THREE.TorusGeometry(0.065,0.02,6,10),'#b4c7c6');
  const float=make(new THREE.SphereGeometry(0.07,10,6),'#dc7e5f');
  const ring=make(new THREE.RingGeometry(0.12,0.14,24),'#d1eee5');
  ring.rotation.x=-Math.PI/2;
  ring.material.transparent=true; ring.material.opacity=0.55; ring.material.depthWrite=false;
  const lineGeometry=new THREE.BufferGeometry();
  const linePositions=new Float32Array(9);
  lineGeometry.setAttribute('position',new THREE.BufferAttribute(linePositions,3));
  const lineMaterial=new THREE.LineBasicMaterial({color:'#e5f4ed',transparent:true,opacity:0.85});
  const line=new THREE.Line(lineGeometry,lineMaterial); line.frustumCulled=false; group.add(line);
  geometries.push(lineGeometry); materials.push(lineMaterial);
  const caught=FISH[catchIndex%FISH.length];
  const fish=make(new THREE.SphereGeometry(0.18,8,5),caught.color);
  fish.scale.set(0.48,0.8,1.5);
  const tail=make(new THREE.ConeGeometry(0.12,0.17,3),caught.color);
  tail.rotation.x=Math.PI/2;
  const tip=new THREE.Vector3(), bobber=new THREE.Vector3(), direction=new THREE.Vector3(), up=new THREE.Vector3(0,1,0);
  let phase='cast';
  return {
    group, caught,
    update(action, animator) {
      const time=action.elapsed, origin=new THREE.Vector3(action.approach.x,action.floor,action.approach.z);
      const hand=animator?.point('Hand_R') || origin.clone().add(new THREE.Vector3(0.2,1.2,0));
      const forward=new THREE.Vector3(Math.sin(action.rotation),0,Math.cos(action.rotation));
      phase=time<2?'cast':time<12?'wait':time<16?'reel':'catch';
      const tilt=time<2?THREE.MathUtils.lerp(-0.5,1,THREE.MathUtils.smoothstep(time/2,0,1)):time<12?1:0.6;
      tip.copy(hand).addScaledVector(forward,tilt*1.8).add(new THREE.Vector3(0,phase==='reel'?1.6:1.3,0));
      direction.copy(tip).sub(hand);
      rod.position.copy(hand).lerp(tip,0.5); rod.scale.y=direction.length(); rod.quaternion.setFromUnitVectors(up,direction.normalize());
      grip.position.copy(hand); grip.quaternion.copy(rod.quaternion);
      reel.position.copy(hand).add(new THREE.Vector3(0.04,-0.06,0.02));
      bobber.set(action.spot.water.x,layout.waterHeight+0.07+Math.sin(time*4)*0.018,action.spot.water.z);
      if (time<2) bobber.copy(hand).lerp(new THREE.Vector3(action.spot.water.x,layout.waterHeight+0.08,action.spot.water.z),THREE.MathUtils.smoothstep(time/2,0,1));
      if (time>12) bobber.lerp(hand.clone().addScaledVector(forward,0.7).add(new THREE.Vector3(0,0.5,0)),THREE.MathUtils.smoothstep((time-12)/4,0,1));
      float.position.copy(bobber);
      linePositions.set(tip.toArray(),0);
      linePositions.set(tip.clone().lerp(bobber,0.55).add(new THREE.Vector3(0,-0.2,0)).toArray(),3);
      linePositions.set(bobber.toArray(),6);
      lineGeometry.attributes.position.needsUpdate=true;
      ring.visible=phase==='wait'||phase==='reel';
      ring.position.set(action.spot.water.x,layout.waterHeight+0.06,action.spot.water.z);
      ring.scale.setScalar(1+(time%1.4)*0.8);
      fish.visible=tail.visible=time>14;
      fish.position.copy(bobber).add(new THREE.Vector3(0,-0.2,0));
      fish.rotation.y=time*4;
      tail.position.copy(fish.position).add(new THREE.Vector3(Math.sin(time*4)*0.28,0,Math.cos(time*4)*0.28));
      tail.rotation.z=time*4;
    },
    diagnostics() { return { phase, tip:tip.toArray(), bobber:bobber.toArray(), catchVisible:fish.visible }; },
    dispose() { geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); },
  };
}

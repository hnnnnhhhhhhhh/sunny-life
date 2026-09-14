import * as THREE from 'three';
import {createNeighborhoodModel} from './neighborhood-assets.js';
import {APARTMENT} from './residence.js';

export const TRAFFIC=Object.freeze({minX:-60,maxX:60,lanes:[11.9,15.5],speed:7,cycle:70,
  departures:[0,8,17,31,39,52],types:['sedan','taxi','van','sedan','van','taxi']});

export function trafficState(seconds,index){
  const start=TRAFFIC.departures[index],elapsed=seconds-start;
  if(elapsed<0)return {visible:false,x:TRAFFIC.minX,z:TRAFFIC.lanes[index%2],direction:index%2?-1:1};
  const age=elapsed%TRAFFIC.cycle,direction=index%2?-1:1;
  return {visible:age<(TRAFFIC.maxX-TRAFFIC.minX)/TRAFFIC.speed,
    x:direction*(TRAFFIC.minX+age*TRAFFIC.speed),z:TRAFFIC.lanes[index%2],direction,age};
}

export function createTraffic(){
  const root=new THREE.Group();root.name='NeighborhoodTraffic';
  const lamps=[],cars=[];
  for(const [index,type] of TRAFFIC.types.entries()){
    const mesh=createNeighborhoodModel(type);
    if(!mesh)continue;
    const wheels=[];
    mesh.traverse(node=>{if(node.userData.wheel)wheels.push(node);});
    const box=new THREE.Box3().setFromObject(mesh),front=box.max.z,back=box.min.z;
    for(const z of [front,back])for(const x of [-.55,.55]){
      const color=z===front?'#f9f1cc':'#d36559';
      const material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0,roughness:.3});
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.21,.11,.018),material);
      lamp.position.set(x,.67,z);lamp.userData.disposable=lamp.userData.ownMaterial=true;
      mesh.add(lamp);lamps.push(material);
    }
    root.add(mesh);cars.push({mesh,wheels,index,type});
  }
  let time=5,night=0;
  function place(){
    for(const car of cars){
      const state=trafficState(time,car.index);
      car.mesh.visible=state.visible;
      car.mesh.position.set(state.x,APARTMENT.streetY+.045,state.z);
      car.mesh.rotation.y=state.direction*Math.PI/2;
      for(const wheel of car.wheels)wheel.rotation.x=-time*TRAFFIC.speed/.34;
    }
  }
  place();
  return {root,update(delta){time+=Math.max(0,delta);place();},
    setNight(amount){night=amount;for(const lamp of lamps)lamp.emissiveIntensity=amount*1.8;},
    diagnostics(){return {time,night,loaded:cars.length,cars:cars.map(({mesh,index,type,wheels})=>({
      index,type,visible:mesh.visible,position:mesh.position.toArray(),rotation:mesh.rotation.y,wheels:wheels.length,
      wheelAngle:wheels[0]?.rotation.x||0,
    }))};},
  };
}

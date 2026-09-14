import * as THREE from 'three';
import {isApartment} from './residence.js';
export const dryingPoint=home=>isApartment(home)?{x:-2,z:5.55}:{x:-7.5,z:3};
export function createDryingRack(home) {
  const root=new THREE.Group(),point=dryingPoint(home),resources=[];
  root.position.set(point.x,.25,point.z);
  const metal=new THREE.MeshStandardMaterial({color:'#a8b9b7',metalness:.65,roughness:.35});
  resources.push(metal);
  function bar(x,y,z,w,h,d) {
    const geometry=new THREE.BoxGeometry(w,h,d),mesh=new THREE.Mesh(geometry,metal);
    resources.push(geometry);mesh.position.set(x,y,z);mesh.castShadow=true;root.add(mesh);return mesh;
  }
  for(const x of [-.75,.75])for(const z of [-.22,.22])bar(x,.62,z,.025,1.24,.025);
  for(const z of [-.22,.22])bar(0,1.24,z,1.55,.025,.025);
  const clothes=new THREE.Group();root.add(clothes);
  for(let i=0;i<3;i++){
    const geometry=new THREE.PlaneGeometry(.36,.7,8,10),positions=geometry.attributes.position;
    for(let j=0;j<positions.count;j++)positions.setZ(j,Math.sin(positions.getX(j)*40)*.014);
    geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:['#8faac0','#e8e4d8','#ad858d'][i],roughness:.95,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set((i-1)*.48,.91,0);mesh.castShadow=true;clothes.add(mesh);
    resources.push(geometry,material);
  }
  return {root,update(stage,time){clothes.visible=['hanging','drying'].includes(stage);
    clothes.children.forEach((mesh,i)=>{mesh.rotation.x=Math.sin(time*.8+i)*.05;});},
    dispose(){resources.forEach(r=>r.dispose());}};
}

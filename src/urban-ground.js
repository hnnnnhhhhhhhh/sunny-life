import * as THREE from 'three';
import {box,cylinder,sphere} from './models.js';
export function buildUrbanGround(root,y){
  box(root,0,y-.18,0,220,.35,220,'#7f9485');
  for(const [x,z,w,d] of [[0,0,18,15],[-22,-16,11,8],[-10,-22,11,8],[3,-23,13,8],[17,-18,12,8],[27,-2,10,8],[-25,1,10,8],[32,-22,18,8]]){
    box(root,x,y+.015,z,w,.025,d,'#aeb9b1');
    for(let px=x-w/2+.8;px<x+w/2;px+=1.6)box(root,px,y+.032,z,.012,.008,d,'#94a49a');
  }
  const roads=[{x:0,z:-10,w:100,d:5.6},{x:-15,z:2,w:4.8,d:18.4},{x:18,z:2,w:4.8,d:18.4},{x:0,z:-31,w:120,d:5.6}];
  for(const r of roads){
    box(root,r.x,y+.018,r.z,r.w+2,.035,r.d+2,'#bac3b9');
    box(root,r.x,y+.04,r.z,r.w,.03,r.d,'#566462');
    const horizontal=r.w>r.d;
    for(let p=-(horizontal?r.w:r.d)/2+2;p<(horizontal?r.w:r.d)/2;p+=4)
      box(root,r.x+(horizontal?p:0),y+.064,r.z+(horizontal?0:p),horizontal?1.6:.08,.006,horizontal?.08:1.6,'#d6d9c9');
  }
  const parks=[{x:1,z:-16,w:13,d:4},{x:-10.7,z:1,w:3.4,d:12},{x:12,z:-8,w:4,d:7},{x:28,z:6,w:14,d:6},{x:-29,z:8,w:12,d:5}];
  for(const park of parks){
    box(root,park.x,y+.035,park.z,park.w,.08,park.d,'#6f9272');
    box(root,park.x,y+.083,park.z,park.w,.025,.8,'#a9b9b1');
    for(const sign of [-1,1]){
      const x=park.x+sign*(park.w/2-.7),z=park.z+.65;
      cylinder(root,x,y+.9,z,.12,.18,1.8,'#81796b',8);
      sphere(root,x,y+2.05,z,.8,1.05,.75,'#5c866d',true);
      sphere(root,x+.38,y+1.9,z+.2,.58,.7,.6,'#76967b',true);
    }
    for(let i=0;i<8;i++){
      const x=park.x-park.w*.4+(i/7)*park.w*.8,z=park.z-park.d*.32;
      sphere(root,x,y+.27,z,.25,.26,.25,i%2?'#88a084':'#62876b',true);
    }
    const bx=park.x,bz=park.z+park.d*.32;
    box(root,bx,y+.5,bz,1.4,.09,.42,'#9d9a7d',.02);
    for(const dx of [-.55,.55])box(root,bx+dx,y+.26,bz,.055,.5,.35,'#677e76');
  }
  return {roads:roads.length,parks:parks.length};
}
let windowMaterials;
export function neighborhoodWindowMaterial(variant){
  if(!windowMaterials)windowMaterials=Array.from({length:4},(_,i)=>{
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=128;
    const ctx=canvas.getContext('2d'),base=ctx.createLinearGradient(0,0,96,100);
    base.addColorStop(0,'#536766');base.addColorStop(.55,i===0?'#8a9c97':'#d4c8a8');base.addColorStop(1,'#6e8480');
    ctx.fillStyle=base;ctx.fillRect(0,0,96,128);
    ctx.fillStyle='#485951';ctx.fillRect(4,99,88,29);
    ctx.fillStyle=i%2?'#81988d':'#a9a797';
    ctx.fillRect(3,8,16+i*3,112);ctx.fillRect(76-i*2,8,17+i*2,112);
    for(let x=7;x<20+i*3;x+=5){ctx.fillStyle='#c1c1a755';ctx.fillRect(x,10,2,107);}
    ctx.fillStyle='#7e8c7b';ctx.fillRect(27,81,40,18);
    const shade=ctx.createLinearGradient(0,0,0,128);
    shade.addColorStop(0,'#1d383b88');shade.addColorStop(.45,'#263c3800');shade.addColorStop(1,'#1d383b77');
    ctx.fillStyle=shade;ctx.fillRect(0,0,96,128);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({color:'#c2d3ce',map:texture,emissiveMap:texture,
      roughness:.42,metalness:.06,emissive:i%2?'#ffdcb7':'#eee6cb',emissiveIntensity:0});
    material.userData.nightWindow=true;material.userData.windowVariant=i;
    return material;
  });
  return windowMaterials[Math.abs(variant)%4];
}
export function addWindowSpill(root,y){
  const lights=[];
  for(const [x,z,direction] of [[-23.2,21.8,-1],[0,21.8,-1],[23.2,21.8,-1],[-10,-18.7,1],[3,-19.7,1]]){
    const light=new THREE.SpotLight('#ffe0bb',0,12,Math.PI*.36,1,2);
    light.position.set(x,y+2,z);light.target.position.set(x,y+.03,z+direction*3);
    light.castShadow=false;root.add(light,light.target);lights.push(light);
  }
  return lights;
}

import * as THREE from 'three';
import {box,cylinder,sphere,material,batchStaticModel} from './models.js';
import {APARTMENT,apartmentRegions} from './residence.js';

const C={plaster:'#dedfd9',trim:'#f5f5ed',blue:'#94aeb8',glass:'#9fc1c7',
  metal:'#738e91',brick:'#b77966',wood:'#b49e81',leaf:'#57876d'};

export function createApartmentGrid() {
  const points=[];
  for(const r of apartmentRegions().filter(r=>r.id!=='corridor')) {
    for(let x=r.x1;x<=r.x2;x+=.5)points.push(x,.272,r.z1,x,.272,r.z2);
    for(let z=r.z1;z<=r.z2;z+=.5)points.push(r.x1,.272,z,r.x2,.272,z);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  return new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#81978c',transparent:true,opacity:.28,depthWrite:false}));
}

function pipe(group,a,b,r,color) {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
  const mesh=cylinder(group,0,0,0,r,r,direction.length(),color,8);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  return mesh;
}

function plant(group,x,y,z,size=1) {
  cylinder(group,x,y+.18*size,z,.19*size,.14*size,.36*size,C.trim,10);
  for(let i=0;i<5;i++) {
    const angle=i*2.4;
    sphere(group,x+Math.sin(angle)*.13*size,y+(.48+i%2*.16)*size,z+Math.cos(angle)*.13*size,
      .12*size,.25*size,.10*size,i%2?C.leaf:'#83a077',true);
  }
}

function glazing(group,x,y,z,width,height,panes=3) {
  const glass=box(group,x,y,z,width,height,.055,C.glass);
  glass.material=material(C.glass,{roughness:.24,metalness:.15,emissive:'#ffd69d',emissiveIntensity:0});
  glass.material.userData.nightWindow=true;
  for(const dx of [-width/2,width/2])box(group,x+dx,y,z+.045,.055,height+.08,.07,C.trim);
  for(const dy of [-height/2,height/2])box(group,x,y+dy,z+.045,width+.08,.055,.07,C.trim);
  for(let i=1;i<panes;i++)box(group,x-width/2+width*i/panes,y,z+.06,.045,height,.07,C.trim);
  box(group,x,y+.22,z+.06,width,.035,.07,C.trim);
  box(group,x,y-height/2-.07,z+.10,width+.2,.10,.22,C.trim);
}

function aircon(group,x,y,z) {
  box(group,x,y,z,.85,.55,.35,'#d7dbd4',.025);
  const fan=cylinder(group,x-.17,y,z+.19,.19,.19,.025,'#748383',16);
  fan.rotation.x=Math.PI/2;
  for(let i=0;i<4;i++)box(group,x+.23,y-.15+i*.10,z+.19,.22,.024,.016,'#9ca9a4');
  pipe(group,[x+.46,y-.1,z],[x+.55,y-.65,z],.024,'#b9beb1');
}

function balcony(group,y,width=12,detail=true) {
  box(group,0,y-.13,5.33,width+.25,.24,1.98,'#dadbd5');
  box(group,0,y+.5,6.2,width,.80,.10,C.wood);
  for(let i=0;i<8;i++)box(group,0,y+.17+i*.1,6.265,width,.022,.012,'#e3ded1');
  pipe(group,[-width/2,y+1.04,6.2],[width/2,y+1.04,6.2],.035,C.trim);
  for(const x of [-width/2,width/2]) {
    box(group,x,y+.55,5.35,.12,1.1,1.7,C.plaster);
    box(group,x,y+1.11,5.35,.16,.08,1.8,C.trim);
  }
  if(!detail)return;
  for(const x of [-4.7,4.6])plant(group,x,y,5.35,.9);
  pipe(group,[-2.8,y+2.16,5.05],[.4,y+2.16,5.05],.018,C.metal);
  for(let i=0;i<7;i++) {
    const x=-2.55+i*.42;
    pipe(group,[x-.16,y+1.99,5.05],[x,y+2.13,5.05],.01,C.metal);
    pipe(group,[x,y+2.13,5.05],[x+.16,y+1.99,5.05],.01,C.metal);
    const cloth=box(group,x,y+1.62,5.05,.34,.71-(i%3)*.1,.035,
      ['#a4b6bb','#ecebe0','#b7826e','#627b75'][i%4]);
    cloth.rotation.z=(i%2?.035:-.035);
  }
  for(const x of [1.2,2.0])box(group,x,y+.51,6.28,.57,.73,.035,'#ece7dc');
}

function storey(group,y,width=12) {
  box(group,0,y+1.5,-.2,width,3,8.6,C.plaster);
  box(group,0,y+3.07,0,width+.28,.17,9.25,C.trim);
  for(const x of [-3.25,2.75]) {
    box(group,x,y+1.55,4.135,5.1,2.8,.10,C.blue);
    glazing(group,x,y+1.60,4.22,4.5,2.25,4);
    for(let i=0;i<6;i++)box(group,x,y+2.70-i*.09,4.33,4.55,.055,.08,C.wood);
  }
  for(const x of [-6.1,6.1]) {
    const side=new THREE.Group();side.position.x=x;side.rotation.y=x<0?-Math.PI/2:Math.PI/2;
    for(const z of [-2,2])glazing(side,z,y+1.7,0,1.55,1.65,2);
    group.add(side);
  }
  balcony(group,y,width);
  aircon(group,5.1,y+2.45,4.35);
}

function distantBuilding(group,x,z,width,floors,color) {
  const building=new THREE.Group();building.position.set(x,APARTMENT.streetY,z);
  box(building,0,floors*1.55,0,width,floors*3.1,6,color);
  for(let floor=0;floor<floors;floor++) {
    const y=floor*3.1;
    box(building,0,y+3.05,0,width+.25,.16,6.25,C.trim);
    for(let wx=-width/2+1.5;wx<width/2;wx+=2.6) {
      glazing(building,wx,y+1.6,3.045,1.7,1.8,2);
      if((floor+Math.round(wx))%2===0)aircon(building,wx+.7,y+.55,3.13);
    }
  }
  group.add(building);
}

export function createApartmentEnvironment() {
  const root=new THREE.Group(),solid=new THREE.Group(),upper=new THREE.Group();
  const streetLights=[];
  root.name='QingheApartmentBlock';
  const y=APARTMENT.streetY;
  box(solid,0,y-.18,0,220,.35,220,'#c2cbc6');
  box(solid,0,y+.02,13.7,180,.035,7.2,'#929d9c');
  for(const z of [9.2,18.2]) {
    box(solid,0,y+.11,z,180,.20,1.8,'#d7dbd2');
    box(solid,0,y+.22,z+(z<12?.9:-.9),180,.045,.12,C.trim);
  }
  for(let x=-70;x<70;x+=4)box(solid,x,y+.045,13.7,1.8,.01,.09,'#e9e9d9');
  for(let z=11;z<16.6;z+=.75)box(solid,13,y+.05,z,3,.012,.35,'#eaece3');
  for(const x of [-9,12]) {
    box(solid,x,y+.12,-1.5,2.2,.20,15,'#9aac93',.1);
    for(let z=-8;z<5;z+=1.4)sphere(solid,x,y+.55,z,.8,.62,.66,z%2?C.leaf:'#82987d',true);
  }
  for(const x of [-12,15,27,-27]) {
    cylinder(solid,x,y+2.1,9,.04,.065,4.2,C.metal,8);
    box(solid,x,y+4.18,9.28,.12,.13,.65,C.metal,.03);
    const bulb=box(root,x,y+4.10,9.50,.23,.035,.32,'#f7eed6');
    bulb.material=material('#f7eed6',{emissive:'#ffdfb0',emissiveIntensity:0});
    bulb.material.userData.nightWindow=true;
    const light=new THREE.PointLight('#ffdab0',0,12,1.5);
    light.position.set(x,y+4,9.5);root.add(light);streetLights.push(light);
    cylinder(solid,x+2,y+.48,8,.16,.20,.96,'#8a8774',8);
    sphere(solid,x+2,y+2,8,.95,1.4,.9,'#73967c',true);
  }
  for(const entry of [[-22,-16,9,4,'#aabbb5'],[-10,-22,9,5,'#bd9787'],[3,-23,11,4,'#a7b5bc'],
    [17,-18,10,5,'#c6c5b9'],[27,-2,8,3,'#b89789'],[-25,1,8,3,'#a4b2b2']])distantBuilding(solid,...entry);
  for(let floor=0;floor<2;floor++)storey(solid,y+.25+floor*APARTMENT.storey);
  for(let floor=0;floor<3;floor++) {
    const base=y+.25+floor*APARTMENT.storey;
    const core=floor===2?upper:solid;
    box(core,7.25,base+1.5,0,2.5,3,9,C.plaster);
    glazing(core,7.25,base+1.7,4.56,1.7,1.7,2);
    const side=new THREE.Group();side.position.x=8.53;side.rotation.y=Math.PI/2;
    for(const x of [-2.6,1.4])glazing(side,x,base+1.75,0,1.2,1.55,2);
    core.add(side);
    for(let row=0;row<6;row++)box(core,8.55,base+row*.5,-.1,.008,.012,8.8,'#c5cbc4');
    box(core,7.25,base+3.07,0,2.75,.17,9.25,C.trim);
  }
  glazing(solid,7.25,y+1.4,4.64,1.75,2.55,2);
  box(solid,7.25,y+2.95,5.2,2.6,.10,1.3,C.metal);
  for(let i=0;i<3;i++)box(solid,7.25,y+.08+i*.06,6.1-i*.2,2.3,.16,.6,'#bdc6c0');
  for(let i=0;i<5;i++)box(solid,8.8,y+.9+(i%3)*.22,4.7,.28,.17,.12,C.metal);
  for(const x of [-5.7,-4.8,9.2])plant(solid,x,y,7.1,1.1);
  const bicycle=new THREE.Group();bicycle.position.set(-7.5,y,6.8);bicycle.rotation.y=.22;
  for(const x of [-.5,.5]) {
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.34,.025,6,18),material('#536964'));
    rim.position.set(x,.36,0);rim.userData.disposable=true;bicycle.add(rim);
  }
  for(const [a,b] of [
    [[-.5,.36,0],[0,.38,0]],[[0,.38,0],[-.25,.9,0]],[[-.25,.9,0],[-.5,.36,0]],
    [[0,.38,0],[.35,.95,0]],[[.35,.95,0],[-.25,.9,0]],[[.35,.95,0],[.5,.36,0]],
  ])pipe(bicycle,a,b,.023,C.brick);
  box(bicycle,-.25,.95,0,.25,.045,.15,'#4f665c',.02);
  pipe(bicycle,[.35,.95,0],[.4,1.14,0],.025,C.metal);
  pipe(bicycle,[.4,1.14,-.15],[.4,1.14,.15],.02,C.metal);
  root.add(bicycle);
  for(const x of [-6.7,8.9])pipe(solid,[x,y+.1,4.5],[x,3.5,4.5],.055,C.trim);
  box(upper,0,3.42,0,12.3,.20,9.3,C.trim);
  box(upper,0,3.55,0,11.8,.08,8.8,'#aebcb5');
  for(const z of [-4.5,4.5])box(upper,0,3.82,z,12.3,.6,.14,C.plaster);
  for(const x of [-6,6])box(upper,x,3.82,0,.14,.6,9,C.plaster);
  for(const x of [-4,-2])aircon(upper,x,3.9,-2);
  box(upper,4,4.1,-2,2.3,1.1,2.5,C.plaster);
  box(upper,4,4.68,-2,2.55,.12,2.7,C.trim);
  balcony(root,.25,12,false);
  for(let z=-4;z<=4;z+=.65)box(root,8.4,.76,z,.045,1.0,.045,C.metal);
  for(const h of [.33,1.28])box(root,8.4,h,0,.065,.065,9.05,C.trim);
  for(const z of [-4.5,4.5])box(root,7.2,.78,z,2.4,1.05,.14,C.plaster);
  root.add(batchStaticModel(solid),upper);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=112;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f0f0e5';ctx.fillRect(0,0,512,112);
  ctx.fillStyle='#536e68';ctx.font='500 64px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('青禾公寓',256,60);
  const signTexture=new THREE.CanvasTexture(canvas);signTexture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.1,.46),new THREE.MeshBasicMaterial({map:signTexture}));
  sign.position.set(7.25,y+3.28,4.72);sign.userData.disposable=sign.userData.ownMaterial=true;root.add(sign);
  const floorSurface=new THREE.Mesh(new THREE.PlaneGeometry(2.4,9),new THREE.MeshBasicMaterial({visible:false}));
  floorSurface.rotation.x=-Math.PI/2;floorSurface.position.set(7.2,.25,0);
  floorSurface.userData.disposable=floorSurface.userData.ownMaterial=true;root.add(floorSurface);
  const nightMaterials=new Set();
  root.traverse(node=>{if(node.material?.userData.nightWindow)nightMaterials.add(node.material);});
  return {root,upper,surfaces:[floorSurface],setExterior(value){upper.visible=value;},
    setNight(amount){
      for(const mat of nightMaterials)mat.emissiveIntensity=amount*.65;
      for(const light of streetLights)light.intensity=amount*5;
    },
    dispose(){signTexture.dispose();},
    diagnostics(){return {style:'urban-apartment',floor:3,storeys:3,exterior:upper.visible};}};
}

export function dressApartment(house,home) {
  const front=house.userData.wallGroups.find(g=>g.wall.id==='exterior-south')?.full;
  if(front)for(const side of [-1,1]) {
    const pane=box(front,side*.8,1.48,4.49,.34,2.36,.045,C.glass);
    pane.material=material(C.glass,{transparent:true,opacity:.38,roughness:.15,depthWrite:false});
    box(front,side*.64,1.48,4.53,.035,2.36,.055,C.trim);
  }
  const back=house.userData.wallGroups.find(g=>g.wall.id==='exterior-north')?.full;
  if(back) {
    for(let i=0;i<9;i++)box(back,2.4,2.98-i*.075,-4.35,4.55,.045,.045,C.wood);
    box(back,-.7,2.25,-4.22,1.3,.8,.35,'#c6cec4',.025);
  }
  const west=house.userData.wallGroups.find(g=>g.wall.id==='exterior-west')?.full;
  if(west) {
    const curtain=new THREE.Group();curtain.position.set(-5.78,0,1.8);
    for(const end of [-1,1])for(let i=0;i<5;i++) {
      const panel=box(curtain,0,1.84,end*(1.4+i*.10),.045,2.55,.13,'#c3bcb1');
      panel.position.x+=Math.sin(i*2)*.04;
    }
    west.add(curtain);
  }
  const divider=house.userData.wallGroups.find(g=>g.wall.id==='bedroom-divider')?.full;
  if(divider) {
    for(let z=1.15;z<4.4;z+=.24)box(divider,1.40,1.8,z,.04,2.95,.055,C.wood);
    for(const y of [1.2,2.4])box(divider,1.34,y,2.3,.10,.07,1.8,C.trim);
  }
  const east=house.userData.wallGroups.find(g=>g.wall.id==='exterior-east')?.full;
  if(east) {
    for(const z of [-2,2]) {
      box(east,5.86,1.95,z,.045,.82,.66,C.wood);
      box(east,5.83,1.95,z,.018,.70,.54,z<0?'#8da9ae':'#bd8170');
      box(east,5.81,1.9,z,.012,.14,.43,'#e4dccb');
    }
  }
  const fittings=new THREE.Group();
  fittings.name='ApartmentFittings';
  for(const region of [{x:-4.25,z:-2.75,w:3.45,d:3.4},{x:7.2,z:0,w:2.35,d:8.95}]) {
    box(fittings,region.x,.259,region.z,region.w,.012,region.d,'#b9c9c5');
    for(let z=-region.d/2;z<=region.d/2;z+=.5)box(fittings,region.x,.267,region.z+z,region.w,.004,.012,'#dfe5de');
  }
  pipe(fittings,[-3.9,2.72,5.6],[-1.2,2.72,5.6],.025,C.metal);
  for(let i=0;i<5;i++) {
    const x=-3.65+i*.48;
    pipe(fittings,[x,2.72,5.6],[x,2.6,5.6],.008,C.metal);
    box(fittings,x,2.23,5.6,.36,.74,.025,['#e5e5dc','#93a8aa','#b88571'][i%3]);
  }
  house.add(fittings);
}

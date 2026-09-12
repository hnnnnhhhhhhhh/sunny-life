import * as THREE from 'three';

export const HANDWASH_DURATION = 11;
export const SINK_LAYOUT = Object.freeze({
  standZ:0.73, waterY:1.32, waterZ:0.07, handY:1.10,
  handleX:0.44, handleY:1.12, handleZ:0.22,
  soapX:-0.45, soapY:1.23, soapZ:0.22,
});
export const sinkCenter = type => type==='kitchen' ? -1.13 : 0;

export function handwashPhase(time) {
  return time<1.2?'tap-on':time<2.5?'soap':time<6.5?'rub':time<8.5?'rinse':time<9.5?'tap-off':'dry';
}

export function handwashTargets(time, fixture, floor) {
  const center=sinkCenter(fixture.type), s=SINK_LAYOUT;
  const toWorld=([x,y,z])=>new THREE.Vector3(x+center,y,z)
    .applyAxisAngle(new THREE.Vector3(0,1,0),fixture.rotation)
    .add(new THREE.Vector3(fixture.x,floor,fixture.z));
  const rub= Math.sin(time*12)*.025;
  const baseL=[.043,s.handY+.025,s.waterZ+rub], baseR=[-.043,s.handY,s.waterZ-rub];
  const phases=[
    [0,baseL,baseR],
    [.65,[s.handleX,s.handleY+.04,s.handleZ],baseR],
    [1.05,[s.handleX,s.handleY+.04,s.handleZ],baseR],
    [1.35,baseL,baseR],
    [1.7,baseL,[s.soapX,s.soapY+.03,s.soapZ]],
    [2.1,baseL,[s.soapX,s.soapY+.015,s.soapZ]],
    [2.5,baseL,baseR],
    [8.5,baseL,baseR],
    [8.8,[s.handleX,s.handleY+.04,s.handleZ],baseR],
    [9.15,[s.handleX,s.handleY+.04,s.handleZ],baseR],
    [9.5,baseL,baseR],
    [11,baseL,baseR],
  ];
  const index=Math.max(1,phases.findIndex(frame=>frame[0]>=time));
  const before=phases[index-1],after=phases[index];
  const t=THREE.MathUtils.smoothstep(time,before[0],after[0]);
  return {left:toWorld(before[1]).lerp(toWorld(after[1]),t),right:toWorld(before[2]).lerp(toWorld(after[2]),t)};
}

export function createHandwashEffects(fixture,floor,model) {
  const root=new THREE.Group(), geometry=[], materials=[];
  root.position.set(fixture.x,floor,fixture.z);root.rotation.y=fixture.rotation;
  const center=sinkCenter(fixture.type);
  const make=(g,color,opacity=1)=>{
    const m=new THREE.MeshStandardMaterial({color,roughness:0.25,transparent:opacity<1,opacity,depthWrite:opacity===1});
    const mesh=new THREE.Mesh(g,m);root.add(mesh);geometry.push(g);materials.push(m);return mesh;
  };
  const water=make(new THREE.CylinderGeometry(0.012,0.018,0.46,8),'#b4e6e9',0.7);
  water.position.set(center,1.09,SINK_LAYOUT.waterZ);
  const drops=Array.from({length:8},()=>make(new THREE.SphereGeometry(0.011,6,4),'#d2f7f4',0.75));
  const foam=Array.from({length:10},(_,i)=>{
    const bubble=make(new THREE.SphereGeometry(0.016+(i%3)*0.006,7,5),'#f5fbf5',0.9);
    return bubble;
  });
  const towel=make(new THREE.BoxGeometry(0.19,0.045,0.12),'#f5f1e3');
  const handle=model?.getObjectByName('TapHandle'), pump=model?.getObjectByName('SoapPump');
  const pumpY=pump?.position.y;
  let time=0,flow=0,foamAmount=0;
  const effects = {
    root,
    update(seconds,strength=1,hands) {
      time=seconds;
      flow=THREE.MathUtils.smoothstep(seconds,.65,1.1)*(1-THREE.MathUtils.smoothstep(seconds,8.7,9.2))*strength;
      foamAmount=THREE.MathUtils.smoothstep(seconds,2.4,3.2)*(1-THREE.MathUtils.smoothstep(seconds,6.5,8.4))*strength;
      if(handle)handle.rotation.z=-0.7*flow;
      if(pump)pump.position.y=pumpY-Math.sin(THREE.MathUtils.clamp((seconds-1.5)/.65,0,1)*Math.PI)*.025*strength;
      water.visible=flow>0.01;water.scale.x=water.scale.z=0.9+Math.sin(seconds*28)*.1;
      for(const [i,drop] of drops.entries()) {
        drop.visible=water.visible;
        drop.position.set(center+Math.sin(i*2.4)*.017,1.31-((seconds*1.1+i*.057)%.45),SINK_LAYOUT.waterZ+Math.cos(i*2.4)*.017);
      }
      const middle=hands?.left.clone().lerp(hands.right,.5);
      const local=middle?root.worldToLocal(middle):new THREE.Vector3(center,SINK_LAYOUT.handY,SINK_LAYOUT.waterZ);
      for(const [i,bubble] of foam.entries()) {
        bubble.visible=foamAmount>.02;
        bubble.position.copy(local).add(new THREE.Vector3(Math.sin(i*2.4)*.055,Math.cos(i*3)*.026,Math.cos(i*2.4)*.033));
        bubble.scale.setScalar(foamAmount*(.9+Math.sin(seconds*5+i)*.1));
      }
      towel.visible=seconds>9.5&&strength>.1;
      towel.position.copy(local);towel.rotation.y=seconds*.5;
    },
    diagnostics(){return{phase:handwashPhase(time),time,flow,foam:foamAmount,towel:towel.visible};},
    dispose(){
      if(handle)handle.rotation.z=0;
      if(pump)pump.position.y=pumpY;
      geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    },
  };
  effects.update(0);
  return effects;
}

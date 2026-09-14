import * as THREE from 'three';
import {avatarModel} from './models.js';
import {DEFAULT_AVATAR} from './game.js';
import {castForRank,WORKPLACE_CAST,npcStatus} from './workplace-cast.js';
import {officeRoute,routePoint} from './office-layout.js';

export const NPC_ANCHORS=Object.freeze({
  danbao:{x:-1,z:1.8},shuijie:{x:-2.8,z:1.6},zhuoge:{x:-1.4,z:-2.4},dayanzei:{x:2.8,z:-3.4},
});
export const NPC_APPEARANCES=Object.fromEntries(WORKPLACE_CAST.map(n=>[n.id,{...DEFAULT_AVATAR,...n.avatar,name:n.name}]));
function nameTag(person){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=88;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#f6f8f2eF';ctx.fillRect(8,4,240,80);
  ctx.fillStyle=person.color;ctx.fillRect(8,4,5,80);
  ctx.fillStyle='#2e4941';ctx.textAlign='center';ctx.font='600 28px sans-serif';ctx.fillText(person.name,128,37);
  ctx.fillStyle='#61716a';ctx.font='20px sans-serif';ctx.fillText(person.title,128,67);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,depthTest:false,toneMapped:false});
  const sprite=new THREE.Sprite(material);sprite.scale.set(1.7,.585,1);sprite.renderOrder=20;
  sprite.userData.officeNpcId=person.id;
  return {sprite,dispose(){texture.dispose();material.dispose();}};
}
export function createOfficePeople(){
  const root=new THREE.Group();root.name='WorkplacePeople';
  const actors=WORKPLACE_CAST.map((person,i)=>{
    const mesh=avatarModel(NPC_APPEARANCES[person.id]),anchor=NPC_ANCHORS[person.id],tag=nameTag(person);
    mesh.position.set(anchor.x,.25,anchor.z);mesh.rotation.y=.6;
    mesh.traverse(n=>{n.userData.officeNpcId=person.id;});
    root.add(mesh,tag.sprite);
    const to={x:anchor.x+.4,z:anchor.z};
    const path=officeRoute(anchor,to);
    return {person,mesh,tag,path,phase:i*13,visible:false,status:'处理日常事务'};
  });
  return {
    root,
    point(id){return actors.find(a=>a.person.id===id)?.mesh.position.clone();},
    update(game,rank,delta){
      const w=game.career.workplace,visible=new Set(castForRank(rank).map(n=>n.id));
      for(const actor of actors){
        const {person,mesh,tag}=actor;
        actor.visible=visible.has(person.id);mesh.visible=tag.sprite.visible=actor.visible;
        if(!actor.visible)continue;
        const n=w?.npcs[person.id],controller=mesh.userData.controller;
        const speaking=w?.event?.npcId===person.id;
        actor.phase+=delta;actor.status=n?npcStatus(n):'处理日常事务';
        const t=actor.phase%36;
        const walking=!speaking&&n?.energy>25&&actor.path.length>1&&t<6;
        if(walking){
          const p=routePoint(actor.path,t<3?t/3:1-(t-3)/3);
          mesh.position.set(p.x,.25,p.z);mesh.rotation.y=p.yaw+(t>=3?Math.PI:0);
        }else if(speaking)mesh.rotation.y=Math.atan2(.6-mesh.position.x,.21-mesh.position.z);
        controller?.play(speaking?'Talk':walking?'Walk':'Idle');
        controller?.update(delta*(walking?.65:1));
        if(!walking&&!speaking)controller?.idlePose();
        if(n?.stress>70)controller?.discomfortPose();
        tag.sprite.position.copy(mesh.position);tag.sprite.position.y=2.9*person.avatar.height;
      }
    },
    diagnostics(){return actors.filter(a=>a.visible).map(a=>({id:a.person.id,name:a.person.name,position:a.mesh.position.toArray(),
      status:a.status,clip:a.mesh.userData.controller?.name,bones:a.mesh.userData.controller?.bones.size}));},
    dispose(){actors.forEach(a=>{a.mesh.userData.controller?.dispose();a.tag.sprite.removeFromParent();a.tag.dispose();});},
  };
}

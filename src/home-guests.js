import * as THREE from 'three';
import {avatarModel} from './models.js';
import {DEFAULT_AVATAR,findPath,surfaceHeight} from './game.js';
import {isApartment} from './residence.js';
import {FRIENDS,visitError} from './social.js';
export const homeExit=home=>isApartment(home)?{x:6.8,z:0}:{x:0,z:home.depth/2+.65};
export function planGuests(world,ids){
  const {home}=world.state.game,entry=homeExit(home),chosen=[];
  const candidates=[{x:-.5,z:0},{x:.7,z:.2},{x:-.6,z:-1.2},{x:-2,z:1.4},{x:1,z:1.7},{x:-4,z:1.5}];
  for(const id of ids){
    let found;
    for(const target of candidates){
      const path=findPath(home,entry,target,world.navGrid),end=path.at(-1);
      if(end&&Math.hypot(end.x-target.x,end.z-target.z)<.4&&chosen.every(p=>Math.hypot(end.x-p.target.x,end.z-p.target.z)>1)){
        found={id,path,target:end};break;
      }
    }
    if(!found)return null;
    chosen.push(found);
  }
  return chosen;
}
export class HomeGuests{
  constructor(world){this.world=world;this.root=new THREE.Group();world.worldRoot.add(this.root);this.actors=[];this.visitId=null;this.stage=null;}
  clear(){for(const a of this.actors){a.mesh.userData.controller?.dispose();a.mesh.removeFromParent();}this.actors=[];this.visitId=null;this.stage=null;}
  person(id){return this.actors.find(a=>a.id===id);}
  update(delta){
    const w=this.world,visit=w.state.game.social?.visit,home=w.state.game.home;
    if(!visit){if(this.actors.length)this.clear();return;}
    if(this.visitId!==visit.id){
      this.clear();this.visitId=visit.id;
      const plans=planGuests(w,visit.ids);
      if(!plans){w.emit({type:'social',value:{kind:'dismiss'}});w.emit({type:'social',value:{kind:'departed',id:visit.id}});return;}
      this.actors=plans.map(plan=>{
        const f=FRIENDS.find(f=>f.id===plan.id),mesh=avatarModel({...DEFAULT_AVATAR,...f.avatar,name:f.name});
        mesh.traverse(n=>{n.userData.guestId=f.id;});
        const position=visit.stage==='arriving'?homeExit(home):plan.target;
        mesh.position.set(position.x,surfaceHeight(home,position.x,position.z),position.z);this.root.add(mesh);
        return {...plan,mesh,path:visit.stage==='arriving'?plan.path.slice():[],time:0};
      });
    }
    if(this.stage!==visit.stage){
      this.stage=visit.stage;
      if(visit.stage==='leaving')for(const a of this.actors)a.path=findPath(home,a.mesh.position,homeExit(home),w.navGrid);
    }
    let moving=false;
    for(const a of this.actors){
      const pos=a.mesh.position,controller=a.mesh.userData.controller;a.time+=delta;
      let remaining=delta*2.1;
      while(a.path.length&&remaining>0){
        const p=a.path[0],dx=p.x-pos.x,dz=p.z-pos.z,d=Math.hypot(dx,dz);
        if(d>.001)a.mesh.rotation.y=Math.atan2(dx,dz);
        if(d<=remaining){pos.x=p.x;pos.z=p.z;a.path.shift();remaining-=d;}else{pos.x+=dx/d*remaining;pos.z+=dz/d*remaining;remaining=0;}
      }
      pos.y=surfaceHeight(home,pos.x,pos.z);
      moving||=a.path.length>0;
      const chatting=w.activities.current?.guestId===a.id&&w.activities.current.stage==='active';
      if(chatting)a.mesh.rotation.y=Math.atan2(w.player.position.x-pos.x,w.player.position.z-pos.z);
      controller?.play(a.path.length?'Walk':chatting?(Math.floor(a.time/2)%2?'Talk':'Listen'):'Idle');
      controller?.update(delta);
      if(!a.path.length&&!chatting)controller?.idlePose();
    }
    if(!moving&&delta>0){
      if(visit.stage==='arriving')w.emit({type:'social',value:{kind:'arrived',id:visit.id}});
      if(visit.stage==='leaving')w.emit({type:'social',value:{kind:'departed',id:visit.id}});
    }
  }
  invite(ids,kind){
    const w=this.world,error=visitError(w.state.game,ids,kind);
    if(error){w.emit({type:'toast',message:error});return false;}
    if(!planGuests(w,ids)){w.emit({type:'toast',message:'家中暂时没有可到达的会客位置'});return false;}
    w.emit({type:'social',value:{kind:'invite',ids,visitKind:kind}});return true;
  }
  diagnostics(){return this.actors.map(a=>({id:a.id,position:a.mesh.position.toArray(),walking:!!a.path.length,clip:a.mesh.userData.controller?.name}));}
  dispose(){this.clear();this.root.removeFromParent();}
}

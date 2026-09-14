import * as THREE from 'three';
import {box,cylinder,furnitureModel} from './models.js';
import {createOfficeAsset,officeAssetStatus} from './office-assets.js';
import {OFFICE,OFFICE_BLOCKS,officeRoute,routePoint} from './office-layout.js';
import {phaseDuration,jobFor} from './career.js';
import {typingTargets,COMPUTER} from './computer.js';
import {createOfficePeople} from './office-people.js';

const mix=(a,b,t)=>a+(b-a)*t,clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const seated=()=>({...OFFICE.seat,yaw:Math.PI,seat:1});
function move(a,b,t){return {...routePoint(officeRoute(a,b),clamp(t)),seat:0};}
function entering(t){
  if(t<.75)return move(OFFICE.entry,OFFICE.approach,t/.75);
  const s=smooth((t-.75)/.25);
  return {x:OFFICE.seat.x,z:mix(OFFICE.approach.z,OFFICE.seat.z,s),yaw:Math.PI,seat:s};
}
function leaveSeat(destination,t){
  if(t<.16){const s=smooth(t/.16);return {x:OFFICE.seat.x,z:mix(OFFICE.seat.z,OFFICE.approach.z,s),yaw:Math.PI,seat:1-s};}
  return move(OFFICE.approach,destination,(t-.16)/.84);
}
function returnSeat(source,t){
  if(t<.84)return move(source,OFFICE.approach,t/.84);
  const s=smooth((t-.84)/.16);return {x:OFFICE.seat.x,z:mix(OFFICE.approach.z,OFFICE.seat.z,s),yaw:Math.PI,seat:s};
}
export function officePose(c){
  const t=clamp(c.phaseMinutes/phaseDuration(c));
  if(c.phase==='arriving')return entering(t);
  if(c.phase==='toCafe')return leaveSeat(OFFICE.cafe,t);
  if(c.phase==='toToilet'){
    if(t<.8)return leaveSeat(OFFICE.toiletApproach,t/.8);
    const s=smooth((t-.8)/.2);
    return {x:OFFICE.toilet.x,z:mix(OFFICE.toiletApproach.z,OFFICE.toilet.z,s),yaw:Math.PI,seat:s,toilet:true};
  }
  if(c.phase==='toDesk')return returnSeat(OFFICE.cafe,t);
  if(c.phase==='fromToilet'){
    if(t<.2){const s=smooth(t/.2);return {x:OFFICE.toilet.x,z:mix(OFFICE.toilet.z,OFFICE.toiletApproach.z,s),yaw:Math.PI,seat:1-s,toilet:true};}
    return returnSeat(OFFICE.toiletApproach,(t-.2)/.8);
  }
  if(c.phase==='break')return {...OFFICE.cafe,yaw:Math.PI/2,seat:0};
  if(c.phase==='toilet')return {...OFFICE.toilet,yaw:Math.PI,seat:1,toilet:true};
  if(c.phase==='leaving'){
    const start=officePose(c.exitOrigin||{phase:'working',phaseMinutes:0});
    const exitZ=start.toilet?OFFICE.toiletApproach.z:start.z+1.05;
    if(start.seat>.01&&t<.18)return {...start,z:mix(start.z,exitZ,smooth(t/.18)),seat:start.seat*(1-smooth(t/.18))};
    const from=start.seat>.01?{x:start.x,z:exitZ}:start;
    return move(from,OFFICE.entry,start.seat>.01?(t-.18)/.82:t);
  }
  return seated();
}

export function createOffice(){
  const root=new THREE.Group();root.name='Workplace';root.add(createOfficeAsset());
  const people=createOfficePeople();root.add(people.root);
  box(root,8.3,.1,0,3.9,.28,13.1,'#b8c2c1');
  for(const z of [-5.5,-3.5,-1.5,.5,2.5,4.5])box(root,8.2,.25,z,3.7,.02,1.96,'#cdd4d2');
  box(root,10.1,.6,0,.14,.7,13.2,'#d8dddd');
  const desk=furnitureModel('desk','#b6c3c6');
  desk.position.set(OFFICE.desk.x,.25,OFFICE.desk.z);root.add(desk);
  const screen=desk.userData.computerPlayback;screen?.setMode('office');
  for(const b of OFFICE_BLOCKS.filter(b=>b.kind==='partition')){
    box(root,b.x,.98,b.z,b.width,1.46,b.depth,'#91a3ad',.015);
    box(root,b.x,1.72,b.z,b.width+.02,.045,b.depth+.02,'#637d88');
  }
  box(root,9.4,.8,-1.4,.8,1.1,3.5,'#84969a');
  box(root,9.4,1.38,-1.4,1,.1,3.6,'#e4e5df',.03);
  box(root,9.4,1.67,-2.2,.56,.52,.65,'#3d505a',.05);
  cylinder(root,9.13,1.42,-2.2,.12,.09,.17,'#eeeee7',20);
  box(root,9.4,1.48,-.6,.5,.09,.65,'#bf986c',.025);
  const toilet=furnitureModel('toilet','#f0eee7');
  toilet.position.set(OFFICE.toilet.x,.25,OFFICE.toilet.z+.1);toilet.rotation.y=Math.PI;root.add(toilet);
  box(root,7.35,1.35,4.25,.1,2.2,2.5,'#d6ddda');
  box(root,8.75,1.35,5.5,2.9,2.2,.1,'#d6ddda');
  const privacy=box(root,8.75,1.35,3,2.9,2.2,.05,'#bdcbc9');privacy.visible=false;
  const cup=new THREE.Group();cylinder(cup,0,0,0,.072,.057,.15,'#f0eee8',20);cylinder(cup,0,.078,0,.061,.061,.004,'#635047',20);
  cup.visible=false;root.add(cup);
  const lunch=new THREE.Group();box(lunch,0,0,0,.18,.1,.12,'#ddbe80',.015);box(lunch,0,0,0,.185,.015,.13,'#81a171');
  lunch.visible=false;root.add(lunch);
  const lamps=[];
  for(const [x,z] of [[-3,-2],[2,-2],[-3,3],[2,3],[8,-1]]){
    const light=new THREE.PointLight('#eff5ff',7,9,2);light.position.set(x,3.5,z);root.add(light);lamps.push(light);
  }
  const movingPhases=['arriving','toCafe','toDesk','toToilet','fromToilet','leaving'];
  let visualTime=0,visualCareer=null,lastPhase=null,currentPose=seated(),lastPoint=null,heading=Math.PI;
  return {root,desk,screen,people,
    reset(){visualCareer=null;lastPoint=null;lastPhase=null;},
    update(game,player,delta,animationDelta=delta){
      const actual=game.career,animator=player.userData.controller;
      people.update(game,jobFor(actual.jobId)?.rank||1,animationDelta);
      if(!visualCareer)visualCareer={...actual};
      if(visualCareer.phase!==actual.phase){
        const finishing=movingPhases.includes(visualCareer.phase)&&visualCareer.phaseMinutes<phaseDuration(visualCareer);
        if(!finishing||actual.phase==='leaving'){
          const exitOrigin=actual.phase==='leaving'?{...visualCareer}:actual.exitOrigin;
          visualCareer={...actual,phaseMinutes:0,exitOrigin};
        }
      }
      visualCareer.phaseMinutes=Math.min(phaseDuration(visualCareer),visualCareer.phaseMinutes+delta*.5);
      const c=visualCareer;
      visualTime+=animationDelta;
      const pose=officePose(c);currentPose=pose;
      const moving=movingPhases.includes(c.phase);
      const incoming=['arriving','toDesk'].includes(c.phase)||c.phase==='toToilet'&&pose.toilet||c.phase==='fromToilet'&&!pose.toilet;
      const transition=pose.seat>.01&&pose.seat<.99;
      const clip=pose.seat>.99?'SitIdle':transition?(incoming?'SitDown':'StandUp'):moving?'Walk':'Idle';
      animator?.play(clip,.12);
      player.position.set(pose.x,.25+(animator?.seatOffset(pose.toilet?.59:COMPUTER.seatTop)||0)*pose.seat,pose.z);
      const angle=Math.atan2(Math.sin(pose.yaw-heading),Math.cos(pose.yaw-heading));
      heading+=angle*(delta?1-Math.exp(-12*delta):lastPoint?0:1);
      if(pose.seat>.99)heading=pose.yaw;
      player.rotation.set(0,heading,0);
      if(transition&&animator?.active)animator.active.time=(incoming?pose.seat:1-pose.seat)*animator.active.getClip().duration;
      animator?.update(transition?0:animationDelta,pose.seat,pose.toilet?.59:COMPUTER.seatTop);
      lastPoint={x:pose.x,z:pose.z};
      const interrupted=actual.workplace?.event||actual.workplace?.project?.overhead>0;
      if(c.phase==='working'&&!interrupted)animator?.typingPose(typingTargets(OFFICE.desk,.25,visualTime),visualTime);
      else if(c.phase==='working')animator?.idlePose();
      if(c.phase==='rest'&&animator)animator.idlePose();
      cup.visible=c.phase==='break'&&c.breakKind==='coffee';
      lunch.visible=c.phase==='break'&&c.breakKind==='lunch';
      if((cup.visible||lunch.visible)&&animator){
        const hand=animator.point('Hand_R'),mouth=animator.point('Mouth'),weight=.5+.5*Math.sin(visualTime*1.5);
        animator.reach(hand.lerp(mouth,weight*.9));
        const prop=cup.visible?cup:lunch;prop.position.copy(animator.point('Hand_R')).add(new THREE.Vector3(0,.03,0));
      }
      privacy.visible=c.phase==='toilet';
      const screenKey=`${c.phase}:${!!interrupted}`;
      if(lastPhase!==screenKey){screen?.setMode('office',interrupted?'工作被打断':jobFor(c.jobId)?.task);screen?.setPlaying(c.phase==='working');lastPhase=screenKey;}
      screen?.update(animationDelta);
    },
    diagnostics(){return {asset:officeAssetStatus(),people:people.diagnostics(),pose:currentPose,phase:visualCareer?.phase,phaseMinutes:visualCareer?.phaseMinutes,screen:screen?.diagnostics(),cup:cup.visible,lunch:lunch.visible,privacy:privacy.visible};},
    dispose(){people.dispose();screen?.dispose();},
  };
}

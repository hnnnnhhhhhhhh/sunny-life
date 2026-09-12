import { MathUtils } from 'three';
import layout from './resident-layout.json' with { type:'json' };

export const BED_TIMING = Object.freeze({ sit:1.6, legs:1.8, recline:1.6, total:5 });
const ease=value=>MathUtils.smoothstep(value,0,1);
const mix=(a,b,t)=>a+(b-a)*t;
const mixAngle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;

export const bedSeatAngle=(seatTop,height)=>Math.acos(MathUtils.clamp(
  (seatTop/height+layout.seatedPelvisPadding-layout.ankleHeight-layout.lowerLeg)/layout.upperLeg,-0.2,0.95));

export function bedPoseAt(seconds,plan,height=1,exiting=false) {
  const t=MathUtils.clamp(seconds,0,BED_TIMING.total);
  const seatedAngle=bedSeatAngle(plan.seatTop,height);
  let sit=1,legs=0,recline=0,slide=0,stage;
  if(t<BED_TIMING.sit) {
    sit=ease((t-0.45)/1.15);
    stage=exiting?'bed-stand':'bed-sit';
  } else if(t<BED_TIMING.sit+BED_TIMING.legs) {
    legs=ease((t-BED_TIMING.sit)/BED_TIMING.legs);
    // Lift the feet clear before swivelling them across the mattress edge.
    slide=ease((legs-0.65)/0.35);
    stage=exiting?'bed-lower':'bed-legs';
  } else {
    legs=slide=1;
    recline=ease((t-BED_TIMING.sit-BED_TIMING.legs)/BED_TIMING.recline);
    stage=exiting?'bed-rise':'bed-recline';
  }
  const standingToSeat=(layout.ankleHeight+layout.lowerLeg+
    layout.upperLeg*Math.cos(seatedAngle*sit))*height;
  const reach=layout.upperLeg*(Math.sin(seatedAngle)-Math.sin(seatedAngle*sit))*height;
  const edge={x:plan.edgeSeat.x+Math.sin(plan.edgeRotation)*reach,z:plan.edgeSeat.z+Math.cos(plan.edgeRotation)*reach};
  return {
    stage,sit,legs,recline,slide,seatedAngle,
    yaw:seconds<BED_TIMING.sit
      ? mixAngle(plan.startRotation??plan.edgeRotation,plan.edgeRotation,ease(t/0.55))
      : mixAngle(plan.edgeRotation,plan.rotation,slide),
    hip:{x:mix(edge.x,plan.sleepHip.x,slide),z:mix(edge.z,plan.sleepHip.z,slide),
      y:plan.floor+mix(standingToSeat,plan.sleepY,slide)},
    cover:legs>0.3?ease((legs-0.3)/0.7):0,
    coverLift:legs*(1-recline),
  };
}

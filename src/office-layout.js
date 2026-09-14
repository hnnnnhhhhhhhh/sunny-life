import PF from 'pathfinding';
import navigation from './assets/office-navigation.json' with {type:'json'};

export const OFFICE=Object.freeze({
  floor:.25,desk:{x:.6,z:-.28,rotation:0},seat:{x:.6,z:.21},approach:{x:.6,z:1.6},
  entry:{x:6.8,z:-1.6},cafe:{x:8.2,z:-1.4},toilet:{x:8.4,z:4.2},toiletApproach:{x:8.4,z:3.2},width:18,depth:14,
});
export const OFFICE_DESKS=[OFFICE.desk];
export const OFFICE_BLOCKS=[
  ...OFFICE_DESKS.flatMap(d=>[
    {x:d.x,z:d.z-.3,width:1.85,depth:.83,kind:'desk'},
    {x:d.x,z:d.z-.88,width:2.65,depth:.10,kind:'partition'},
    ...[-1,1].map(side=>({x:d.x+side*1.28,z:d.z-.29,width:.10,depth:1.27,kind:'partition'})),
  ]),
  {x:9.4,z:-1.4,width:.8,depth:3.5,kind:'counter'},
  {x:7.35,z:4.25,width:.1,depth:2.5,kind:'wall'},
  {x:8.75,z:5.5,width:2.9,depth:.1,kind:'wall'},
];
const {step:STEP,minX:X,minZ:Z,width:W,height:H}=navigation;
const routes=new Map();
function makeGrid(){
  const grid=new PF.Grid(W,H);
  for(let iz=0;iz<H;iz++)for(let ix=0;ix<W;ix++){
    const x=X+ix*STEP,z=Z+iz*STEP;
    if(navigation.blocked[iz*W+ix]||ix===0||iz===0||ix===W-1||iz===H-1||OFFICE_BLOCKS.some(b=>Math.abs(x-b.x)<b.width/2+.2&&Math.abs(z-b.z)<b.depth/2+.2))
      grid.setWalkableAt(ix,iz,false);
  }
  return grid;
}
export function officeRoute(from,to){
  const key=[from.x,from.z,to.x,to.z].join(':');
  if(routes.has(key))return routes.get(key);
  const grid=makeGrid();
  const cell=p=>[Math.round((p.x-X)/STEP),Math.round((p.z-Z)/STEP)];
  const start=cell(from),end=cell(to);
  if(!grid.isInside(...start)||!grid.isInside(...end)||!grid.isWalkableAt(...start)||!grid.isWalkableAt(...end))return [];
  const path=new PF.AStarFinder({allowDiagonal:true,dontCrossCorners:true}).findPath(...start,...end,grid);
  const result=path.length?[from,...PF.Util.compressPath(path).slice(1,-1).map(([x,z])=>({x:X+x*STEP,z:Z+z*STEP})),to]:[];
  if(routes.size>64)routes.clear();
  routes.set(key,result);return result;
}
export function routePoint(path,progress){
  if(!path.length)return {...OFFICE.entry,yaw:0};
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p.x-path[i].x,p.z-path[i].z));
  let distance=Math.max(0,Math.min(1,progress))*lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){
    if(distance<=lengths[i]||i===lengths.length-1){
      const t=lengths[i]?distance/lengths[i]:0,a=path[i],b=path[i+1];
      return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z)};
    }
    distance-=lengths[i];
  }
  return {...path.at(-1),yaw:0};
}

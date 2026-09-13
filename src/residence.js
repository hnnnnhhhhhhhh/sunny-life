export const isApartment = home => home?.residence === 'apartment';
export const APARTMENT = Object.freeze({
  floor: 3, streetY: -6.6, storey: 3.3,
  balcony: { id:'balcony', x1:-6, x2:6, z1:4.5, z2:6.2 },
  corridor: { id:'corridor', x1:6, x2:8.4, z1:-4.5, z2:4.5 },
});

export function apartmentRegions() {
  return [{id:'unit',x1:-6,x2:6,z1:-4.5,z2:4.5},APARTMENT.balcony,APARTMENT.corridor];
}

export function apartmentWalkable(x,z,margin=0) {
  return [[0,0],[-margin,0],[margin,0],[0,-margin],[0,margin]].every(([dx,dz])=>
    apartmentRegions().some(r=>x+dx>=r.x1&&x+dx<=r.x2&&z+dz>=r.z1&&z+dz<=r.z2));
}

export function apartmentPlaceable(rect) {
  return apartmentRegions().filter(r=>r.id!=='corridor').some(r=>
    rect.x-rect.width/2>=r.x1+.1&&rect.x+rect.width/2<=r.x2-.1&&
    rect.z-rect.depth/2>=r.z1+.1&&rect.z+rect.depth/2<=r.z2-.1);
}

export const APARTMENT_COLLIDERS = [
  {x:0,z:6.2,width:12.2,depth:.16},
  {x:-6,z:5.35,width:.16,depth:1.7},
  {x:6,z:5.35,width:.16,depth:1.7},
  {x:8.4,z:0,width:.16,depth:9.2},
  {x:7.2,z:-4.5,width:2.4,depth:.16},
  {x:7.2,z:4.5,width:2.4,depth:.16},
];

export function apartmentExterior() {
  return [
    {id:'exterior-north',x1:-6,z1:-4.5,x2:6,z2:-4.5,
      openings:[{kind:'window',position:-4.3,width:1.3},{kind:'window',position:2.4,width:4.5}]},
    {id:'exterior-west',x1:-6,z1:-4.5,x2:-6,z2:4.5,
      openings:[{kind:'window',position:1.8,width:3.7}]},
    {id:'exterior-east',x1:6,z1:-4.5,x2:6,z2:4.5,
      openings:[{kind:'door',position:0,width:1.5}]},
    {id:'exterior-south',x1:-6,z1:4.5,x2:6,z2:4.5,
      openings:[{kind:'window',position:-4,width:2.5},{kind:'door',position:0,width:2},{kind:'window',position:3.5,width:3.4}]},
  ].map(w=>({...w,exterior:true,locked:true}));
}

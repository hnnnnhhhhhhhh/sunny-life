import * as THREE from 'three';

export const SURFACE_SPECS={
  oak:{meters:.85,roughness:.58,strength:.8},
  linen:{meters:.26,roughness:.94,strength:1.1},
  plaster:{meters:1.2,roughness:.9,strength:.5},
  stone:{meters:1.1,roughness:.65,strength:.7},
  brick:{meters:1.8,roughness:.87,strength:1.2},
};
const fract=x=>x-Math.floor(x),mix=(a,b,t)=>a+(b-a)*t;
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7+41.27)*43758.5453);
function noise(u,v,frequency){
  const x=u*frequency,y=v*frequency,ix=Math.floor(x),iy=Math.floor(y);
  const sx=fract(x),sy=fract(y),tx=sx*sx*(3-2*sx),ty=sy*sy*(3-2*sy);
  const n=(a,b)=>hash((a+frequency)%frequency,(b+frequency)%frequency);
  return mix(mix(n(ix,iy),n(ix+1,iy),tx),mix(n(ix,iy+1),n(ix+1,iy+1),tx),ty);
}
function field(kind,u,v){
  const fine=noise(u,v,128),medium=noise(u,v,32),broad=noise(u,v,4);
  if(kind==='oak'){
    const warp=Math.sin(v*Math.PI*2)*.008+Math.sin(v*Math.PI*6+u*Math.PI*2)*.003;
    const grain=Math.pow(.5+.5*Math.sin((u+warp)*Math.PI*2*45),9);
    const earlywood=.5+.5*Math.sin((u+warp*.6)*Math.PI*2*7+Math.sin(v*Math.PI*2)*.3);
    const pore=grain*(.35+.65*noise(u,v,16));
    return {color:.87-pore*.10+earlywood*.055+(fine-.5)*.014,height:.5-pore*.15+(fine-.5)*.05};
  }
  if(kind==='linen'){
    const x=u*64,y=v*64,vertical=.5+.5*Math.cos(fract(x)*Math.PI*2),horizontal=.5+.5*Math.cos(fract(y)*Math.PI*2);
    const over=(Math.floor(x)+Math.floor(y))%2;
    const thread=over?vertical*(.7+.3*horizontal):horizontal*(.7+.3*vertical);
    return {color:.78+thread*.17+(fine-.5)*.025,height:.25+thread*.48};
  }
  if(kind==='brick'){
    const row=Math.floor(v*8),x=fract(u*4+(row%2)*.5),y=fract(v*8);
    const edge=Math.min(x*4,(1-x)*4,y,1-y);
    const mortar=THREE.MathUtils.smoothstep(edge,.012,.09);
    const variation=hash(Math.floor(u*4+(row%2)*.5)%4,row);
    return {color:mix(.93,.66+variation*.19+(medium-.5)*.07,mortar),height:mix(.2,.65+(medium-.5)*.15,mortar)};
  }
  if(kind==='stone'){
    return {color:.84+(broad-.5)*.09+(medium-.5)*.09+(fine-.5)*.12,height:.5+(fine-.5)*.24+(medium-.5)*.06};
  }
  return {color:.90+(broad-.5)*.035+(medium-.5)*.025+(fine-.5)*.03,height:.5+(medium-.5)*.12+(fine-.5)*.16};
}

export function createSurfaceMaps(kind,size=512){
  const spec=SURFACE_SPECS[kind],color=new Uint8Array(size*size*4),normal=color.slice(),roughness=color.slice();
  const heights=new Float32Array(size*size);
  const byte=x=>Math.round(THREE.MathUtils.clamp(x,0,1)*255);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x,sample=field(kind,x/size,y/size);
    heights[i]=sample.height;
    color.set([byte(sample.color),byte(sample.color),byte(sample.color),255],i*4);
    const r=byte(.90+(sample.height-.5)*.13);
    roughness.set([r,r,r,255],i*4);
  }
  const at=(x,y)=>heights[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(at(x-1,y)-at(x+1,y))*spec.strength,dy=(at(x,y-1)-at(x,y+1))*spec.strength;
    const length=Math.hypot(dx,dy,1);
    normal.set([byte(dx/length*.5+.5),byte(dy/length*.5+.5),byte(1/length*.5+.5),255],(y*size+x)*4);
  }
  const maps={meters:spec.meters};
  for(const [name,data] of Object.entries({color,normal,roughness})){
    const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps=true;texture.anisotropy=4;
    texture.colorSpace=name==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.name=`${kind}-${name}`;texture.needsUpdate=true;
    maps[name]=texture;
  }
  return maps;
}

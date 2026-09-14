import * as THREE from 'three';

export const COMPUTER = Object.freeze({ seatZ: .49, seatTop: .57, keyboardY: .966, keyboardZ: -.06 });

export function typingTargets(fixture, floor, time) {
  const c=Math.cos(fixture.rotation),s=Math.sin(fixture.rotation);
  const target=(x,phase)=>{
    const z=COMPUTER.keyboardZ+Math.sin(time*2+phase)*.025;
    return new THREE.Vector3(fixture.x+x*c+z*s,
      floor+COMPUTER.keyboardY+.026+Math.max(0,Math.sin(time*10+phase))*.018,
      fixture.z-x*s+z*c);
  };
  // The resident faces the screen, opposite the desk's local front direction.
  return {left:target(.13,0),right:target(-.13,Math.PI)};
}

export function createComputerScreen() {
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=320;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  const geometry=new THREE.PlaneGeometry(.86,.53);
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='ComputerScreen';mesh.position.set(0,1.31,-.437);
  let playing=false,time=0,frame=0,lastStep=-1,mode='chat',title='';
  const messages=['今天过得怎么样？','刚收拾好家，想歇一会儿。','我也是，晚上一起看电影吧。','好呀，给我推荐一部！'];
  function draw() {
    ctx.fillStyle=playing?'#edf4f2':'#253d43';ctx.fillRect(0,0,512,320);
    if(playing&&mode!=='chat'){
      ctx.fillStyle='#405962';ctx.fillRect(0,0,512,48);
      ctx.fillStyle='#f7faf9';ctx.font='20px sans-serif';ctx.fillText(mode==='jobs'?'青禾招聘':title||'今日工作',20,31);
      const rows=mode==='jobs'?['文档助理          320 / 天','视觉设计师        480 / 天','软件测试员        600 / 天']:
        ['任务列表','待处理文档','修改记录','核对与提交'];
      for(let i=0;i<rows.length;i++){
        ctx.fillStyle='#ffffff';ctx.fillRect(18,62+i*51,476,42);
        ctx.fillStyle='#415861';ctx.font='18px sans-serif';ctx.fillText(rows[i],30,89+i*51);
      }
      ctx.fillStyle='#91b4aa';ctx.fillRect(22,287,80+(Math.floor(time)%8)*42,5);
    }else if(playing) {
      ctx.fillStyle='#365951';ctx.fillRect(0,0,512,50);
      ctx.fillStyle='#f6f6ee';ctx.font='20px sans-serif';ctx.fillText('好友 · 江宁',22,33);
      ctx.fillStyle='#86c49d';ctx.beginPath();ctx.arc(475,25,6,0,Math.PI*2);ctx.fill();
      const count=Math.min(messages.length,1+Math.floor(time/2.4));
      for(let i=0;i<count;i++) {
        const x=i%2?110:20,y=66+i*48;
        ctx.fillStyle=i%2?'#bee2d1':'#ffffff';ctx.fillRect(x,y,380,37);
        ctx.fillStyle='#344b48';ctx.font='17px sans-serif';ctx.fillText(messages[i],x+12,y+24);
      }
      ctx.fillStyle='#d8e5e1';ctx.fillRect(16,272,480,34);
      const dots=1+Math.floor(time*2)%3;
      ctx.fillStyle='#547268';ctx.fillText('.'.repeat(dots),30,293);
    } else {
      ctx.fillStyle='#86aaa5';ctx.fillRect(236,153,40,3);
    }
    texture.needsUpdate=true;frame++;
  }
  draw();
  return {
    mesh,
    setMode(value,heading=''){mode=['chat','jobs','office'].includes(value)?value:'chat';title=heading;draw();},
    setPlaying(value) { if(playing===value)return;playing=value;time=0;lastStep=-1;draw(); },
    update(delta) {
      if(!playing||delta<=0)return;
      time+=delta;
      const step=Math.floor(time*4);
      if(step!==lastStep){lastStep=step;draw();}
    },
    diagnostics() {
      const data=ctx.getImageData(0,0,512,320).data;
      let checksum=0;
      for(let i=0;i<data.length;i+=64)checksum=(checksum*31+data[i]+data[i+1])>>>0;
      return {playing,time,frame,checksum,mode};
    },
    dispose(){geometry.dispose();material.dispose();texture.dispose();},
  };
}

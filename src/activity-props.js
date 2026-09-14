import * as THREE from 'three';

export function sleepCoverHeight(x,z,height=1) {
  const across=Math.max(0,Math.cos(x/1.27*Math.PI)),along=(z+.57)/1.94;
  return .83+(.335+Math.max(0,height-1)*.25-along*.065)*Math.pow(across,.66)+Math.sin(z*17+x*11)*.008*across;
}

export function createSleepCover(color,height=1) {
  const geometry = new THREE.PlaneGeometry(1.27, 1.94, 20, 28);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = -positions.getY(i) + 0.4;
    const y = sleepCoverHeight(x,z,height);
    positions.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  const original = positions.array.slice();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.96, side: THREE.DoubleSide, transparent: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    update(time, opacity = 1, lift = 0, side = 1) {
      material.opacity = opacity;
      for(let i=0;i<positions.count;i++) {
        const edge=(original[i*3]/0.635*side+1)/2;
        positions.setY(i,original[i*3+1]+lift*0.18*edge);
      }
      positions.needsUpdate=true;
      geometry.computeVertexNormals();
      mesh.scale.y = 1 + Math.sin(time * 1.5) * 0.005;
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}

export function createTelevision() {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 216;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(1.59, 0.85);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'TVScreen';
  mesh.position.set(-0.08, 1.25, 0.041);
  let playing = false, time = 0, accumulated = 0, frame = 0, channel = 'nature';
  function draw() {
    if (!playing) {
      ctx.fillStyle = '#293c40'; ctx.fillRect(0, 0, 384, 216);
      ctx.fillStyle = '#617e80'; ctx.fillRect(182, 103, 20, 2);
    } else if (channel === 'news') {
      ctx.fillStyle='#dde5e9';ctx.fillRect(0,0,384,216);
      ctx.fillStyle='#477d88';ctx.fillRect(185,24,178,110);
      ctx.strokeStyle='#b6d9d0';ctx.lineWidth=3;
      for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(274,78,18+i*8,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle='#475564';ctx.fillRect(70,78,76,80);
      ctx.fillStyle='#d4a485';ctx.beginPath();ctx.arc(108,57,26,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#eef1eb';ctx.fillRect(20,141,344,41);
      ctx.fillStyle='#ad5353';ctx.fillRect(0,187,384,29);
      ctx.fillStyle='#fff';ctx.font='bold 16px sans-serif';ctx.fillText('QINGHE NEWS',22,169);
      ctx.font='13px sans-serif';ctx.fillText('CITY UPDATE  /  COMMUNITY & CULTURE',20-(time*18%70),207);
    } else if (channel === 'comedy') {
      ctx.fillStyle='#e8c5a8';ctx.fillRect(0,0,384,216);
      ctx.fillStyle='#72998e';ctx.fillRect(25,90,330,104);
      for(let i=0;i<2;i++){
        const x=125+i*128,y=65+Math.sin(time*3+i)*6;
        ctx.fillStyle=i?'#cba174':'#6e81a0';ctx.fillRect(x-24,y+25,48,68);
        ctx.fillStyle='#e7b99b';ctx.beginPath();ctx.arc(x,y,24,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.fillRect(x-44,y-43,88,15);
        ctx.fillStyle='#475b53';ctx.font='12px sans-serif';ctx.fillText(i?'Really?':'Good day!',x-30,y-31);
      }
      ctx.fillStyle='#fff';ctx.font='bold 13px sans-serif';ctx.fillText('WEEKEND COMEDY',14,21);
    } else if (channel === 'music') {
      ctx.fillStyle='#3e414b';ctx.fillRect(0,0,384,216);
      for(let i=0;i<12;i++){
        const height=25+Math.abs(Math.sin(time*2+i*.7))*120;
        ctx.fillStyle=['#91b9a5','#d3ad78','#bd8794'][i%3];
        ctx.fillRect(15+i*30,190-height,18,height);
      }
      ctx.fillStyle='#fff';ctx.font='bold 14px sans-serif';ctx.fillText('LIVE SESSIONS',14,23);
    } else {
      ctx.fillStyle = '#8dbfcb'; ctx.fillRect(0, 0, 384, 216);
      ctx.fillStyle = '#f2ddb1'; ctx.beginPath(); ctx.arc(280, 47, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6d9981'; ctx.beginPath(); ctx.moveTo(0, 136); ctx.lineTo(67, 71); ctx.lineTo(141, 139); ctx.lineTo(206, 99); ctx.lineTo(299, 148); ctx.lineTo(384, 108); ctx.lineTo(384, 216); ctx.lineTo(0, 216); ctx.fill();
      ctx.fillStyle = '#548f9e'; ctx.fillRect(0, 150, 384, 66);
      const boatX = 25 + ((time * 20) % 320);
      ctx.fillStyle = '#d6a572'; ctx.beginPath(); ctx.moveTo(boatX - 21, 180); ctx.lineTo(boatX + 27, 180); ctx.lineTo(boatX + 14, 190); ctx.lineTo(boatX - 11, 190); ctx.fill();
      ctx.fillStyle = '#f7ead1'; ctx.beginPath(); ctx.moveTo(boatX, 137); ctx.lineTo(boatX, 177); ctx.lineTo(boatX + 27, 174); ctx.fill();
      ctx.strokeStyle = '#cae3df'; ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const x = ((i * 49 + time * 31) % 420) - 20, y = 159 + (i % 3) * 19;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 10, y + Math.sin(time + i) * 3, x + 23, y); ctx.stroke();
      }
      ctx.fillStyle = '#f8f8e7'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('NATURE', 14, 22);
      ctx.fillStyle = '#d9e9b4'; ctx.fillRect(335, 15, 33, 3);
    }
    texture.needsUpdate = true; frame++;
  }
  draw();
  return {
    mesh,
    setChannel(value) { if(['nature','news','comedy','music'].includes(value)){channel=value;time=0;draw();} },
    setPlaying(value) { playing = value; accumulated = 0; draw(); },
    update(delta) { if (!playing || !delta) return; time += delta; accumulated += delta; if (accumulated > 0.08) { accumulated = 0; draw(); } },
    diagnostics() {
      const data = ctx.getImageData(0, 0, 384, 216).data;
      let checksum = 0;
      for (let i = 0; i < data.length; i += 64) checksum = (checksum * 31 + data[i] + data[i + 1]) >>> 0;
      return { playing, time, frame, checksum, channel };
    },
    dispose() { geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}

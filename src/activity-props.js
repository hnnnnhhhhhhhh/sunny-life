import * as THREE from 'three';

export function createSleepCover(color) {
  const geometry = new THREE.PlaneGeometry(1.27, 1.94, 20, 28);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = -positions.getY(i) + 0.4;
    const across = Math.max(0, Math.cos(x / 1.27 * Math.PI));
    const along = (z + 0.57) / 1.94;
    const y = 0.83 + (0.29 - along * 0.065) * Math.pow(across, 0.66) + Math.sin(z * 17 + x * 11) * 0.008 * across;
    positions.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.96, side: THREE.DoubleSide, transparent: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return {
    mesh,
    update(time, opacity = 1) { material.opacity = opacity; mesh.scale.y = 1 + Math.sin(time * 1.5) * 0.005; },
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
  let playing = false, time = 0, accumulated = 0, frame = 0;
  function draw() {
    if (!playing) {
      ctx.fillStyle = '#293c40'; ctx.fillRect(0, 0, 384, 216);
      ctx.fillStyle = '#617e80'; ctx.fillRect(182, 103, 20, 2);
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
    setPlaying(value) { playing = value; accumulated = 0; draw(); },
    update(delta) { if (!playing || !delta) return; time += delta; accumulated += delta; if (accumulated > 0.08) { accumulated = 0; draw(); } },
    diagnostics() {
      const data = ctx.getImageData(0, 0, 384, 216).data;
      let checksum = 0;
      for (let i = 0; i < data.length; i += 64) checksum = (checksum * 31 + data[i] + data[i + 1]) >>> 0;
      return { playing, time, frame, checksum };
    },
    dispose() { geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}

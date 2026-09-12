import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { layout } from './terrain.js';

export function distanceToShore(x, z) {
  let distance = Infinity;
  for (const land of layout.lands) for (let i = 0; i < land.polygon.length; i++) {
    const a = land.polygon[i], b = land.polygon[(i + 1) % land.polygon.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return distance;
}

function shoreTexture() {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const distance = distanceToShore(x / (size - 1) * 96 - 48, y / (size - 1) * 96 - 48);
    const i = (y * size + x) * 4;
    data[i] = Math.round(Math.min(1, distance / 12) * 255); data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createOcean() {
  const shader = {
    name: 'CoastalWater',
    uniforms: { color: { value: new THREE.Color('#277e98') }, tDiffuse: { value: null },
      textureMatrix: { value: new THREE.Matrix4() }, uTime: { value: 0 }, uShore: { value: null },
      uHorizon: { value: new THREE.Color('#c4d7d3').convertLinearToSRGB() },
      uHazeRange: { value: new THREE.Vector2(65,190) },
      uEye: { value: new THREE.Vector3() }, uView: { value: new THREE.Vector3() }, uOrtho: { value: 1 } },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vMirror;
      varying vec3 vWorld;
      void main() {
        vMirror = textureMatrix * vec4(position, 1.0);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform sampler2D uShore;
      uniform float uTime;
      uniform vec3 uEye;
      uniform vec3 uView;
      uniform float uOrtho;
      uniform vec3 uHorizon;
      uniform vec2 uHazeRange;
      varying vec4 vMirror;
      varying vec3 vWorld;
      float heightAt(vec2 p) {
        return sin(p.x * 1.4 + p.y * 0.8 - uTime * 1.05) * 0.07
          + sin(p.x * -0.62 + p.y * 1.7 + uTime * 0.72) * 0.045
          + sin(p.x * 3.6 + p.y * 2.4 - uTime * 0.91) * 0.018;
      }
      void main() {
        vec2 p = vWorld.xz;
        float h = heightAt(p);
        vec3 n = normalize(vec3((h-heightAt(p+vec2(0.08,0.0)))/0.08, 1.0,
          (h-heightAt(p+vec2(0.0,0.08)))/0.08));
        vec3 view = normalize(mix(uEye-vWorld, -uView, uOrtho));
        float fresnel = 0.21 + 0.62 * pow(1.0-max(dot(n,view),0.0), 4.0);
        float shore = texture2D(uShore, (p+48.0)/96.0).r * 12.0;
        float shallow = 1.0-smoothstep(0.2,3.4,shore);
        vec3 tint = mix(vec3(0.009,0.105,0.17),vec3(0.07,0.48,0.43),shallow);
        vec2 reflectionUV = vMirror.xy/vMirror.w + n.xz * 0.018;
        vec3 reflection = texture2D(tDiffuse, reflectionUV).rgb;
        vec3 water = mix(tint,reflection, fresnel * 0.8);
        vec3 sun = normalize(vec3(-0.45,0.8,0.3));
        float spec = pow(max(dot(reflect(-sun,n),view),0.0),170.0);
        water += vec3(0.8,0.94,0.92)*spec*0.16;
        float crest = smoothstep(0.065,0.115,h)*0.055;
        water += vec3(0.2,0.38,0.39)*crest;
        float foam = (1.0-smoothstep(0.16,0.38,abs(shore-0.55-h*1.3)))
          * (0.65+0.35*sin(p.x*2.1+p.y*1.8+uTime*0.6));
        water = mix(water, vec3(0.71,0.91,0.84),foam*0.52);
        float alpha = mix(0.96,0.48,shallow);
        gl_FragColor = vec4(water,alpha + foam*0.2);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float haze = smoothstep(uHazeRange.x,uHazeRange.y,length(p-uEye.xz));
        gl_FragColor.rgb = mix(gl_FragColor.rgb,uHorizon,haze);
        gl_FragColor.a = mix(gl_FragColor.a,1.0,haze);
      }
    `,
  };
  const mesh = new Reflector(new THREE.PlaneGeometry(4000, 4000), {
    shader, textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: 0.003,
  });
  mesh.name = 'CoastalOcean';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = layout.waterHeight;
  mesh.material.transparent = true;
  mesh.material.depthWrite = false;
  const shore = shoreTexture();
  mesh.material.uniforms.uShore.value = shore;
  const renderReflection = mesh.onBeforeRender;
  let reflectedFrames = 0, lowQuality = false, lastReflection = -Infinity;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.material.uniforms.uEye.value.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(mesh.material.uniforms.uView.value);
    mesh.material.uniforms.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
    const now=performance.now();
    if(lowQuality && now-lastReflection<250) return;
    lastReflection=now;
    const before = scene.onBeforeRender;
    // Reflector's built-in oblique clip assumes perspective. The general
    // inverse-projection form also clips correctly for our orthographic camera.
    scene.onBeforeRender = (...args) => {
      const reflected = args[2];
      if (reflected === mesh.camera) {
        const plane = new THREE.Plane(new THREE.Vector3(0,1,0),-layout.waterHeight)
          .applyMatrix4(reflected.matrixWorldInverse);
        const clip = new THREE.Vector4(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
        const projection = reflected.projectionMatrix.copy(camera.projectionMatrix);
        const q = new THREE.Vector4(Math.sign(clip.x),Math.sign(clip.y),1,1)
          .applyMatrix4(projection.clone().invert());
        clip.multiplyScalar(2/clip.dot(q));
        const e = projection.elements;
        e[2]=clip.x-e[3]; e[6]=clip.y-e[7]; e[10]=clip.z-e[11]; e[14]=clip.w-e[15];
        reflected.projectionMatrixInverse.copy(projection).invert();
        reflected.isOrthographicCamera=!!camera.isOrthographicCamera;
        reflected.isPerspectiveCamera=!!camera.isPerspectiveCamera;
      }
      before.call(scene,...args);
    };
    try { renderReflection.call(mesh, renderer, scene, camera); }
    finally { scene.onBeforeRender=before; }
    reflectedFrames++;
  };
  return {
    mesh,
    setQuality(low) {
      lowQuality=low;
      const size=low?192:512;
      mesh.getRenderTarget().setSize(size,size);
      lastReflection=-Infinity;
    },
    update(time) { mesh.material.uniforms.uTime.value = time * 0.001; },
    time() { return mesh.material.uniforms.uTime.value; },
    diagnostics() { return { reflectedFrames, style: 'shallow-reflective', shoreResolution: 256, lowQuality, horizonHaze:[65,190], extent:4000 }; },
    dispose() { mesh.dispose(); mesh.geometry.dispose(); shore.dispose(); },
  };
}

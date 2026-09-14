import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';
import manifest from './assets/resident-manifest.json';
import layout from './resident-layout.json' with { type:'json' };
import {downloadAsset} from './asset-download.js';

let residentAsset, loading, loadError;
let activeManifest=manifest;
const materials = new Map();

export function loadResidentAssets(onProgress) {
  if (loading) return loading;
  loading = (async () => {
    try {
      if(import.meta.env.DEV&&new URLSearchParams(location.search).get('resident')==='refined'){
        const response=await fetch('/__local-resident/manifest.json');
        if(!response.ok)throw new Error('Local refined resident has not been built.');
        activeManifest=await response.json();
      }
      const compressed=activeManifest.compressedFile&&typeof DecompressionStream!=='undefined';
      const file=compressed?activeManifest.compressedFile:activeManifest.file;
      const hash=compressed?activeManifest.compressedSha256:activeManifest.sha256;
      let buffer=await downloadAsset(`${import.meta.env.BASE_URL}${file}?v=${hash.slice(0,12)}`,{
        onProgress,expectedBytes:compressed?activeManifest.compressedBytes:activeManifest.bytes,decodedBytes:activeManifest.bytes,
      });
      const signature=new Uint8Array(buffer,0,Math.min(2,buffer.byteLength));
      // HTTP Content-Encoding may already have been decoded by the browser.
      if(compressed&&signature[0]===0x1f&&signature[1]===0x8b)
        buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      residentAsset = await new GLTFLoader().parseAsync(buffer, '');
      for (const name of manifest.animations) {
        if (!residentAsset.animations.some(clip => clip.name === name)) throw new Error(`Missing animation: ${name}`);
      }
    } catch (error) {
      residentAsset = null;
      loadError = error.message;
      console.warn('Resident model unavailable, using the basic character.', error.message);
    }
    return residentAssetStatus();
  })();
  return loading;
}

function coloredMaterial(original, avatar) {
  const role = original.name.replace('Resident_', '');
  if(original.userData.supplied_character){
    const role=original.userData.surface_role;
    const source={Skin:avatar.skin,Hair:avatar.hairColor,Top:avatar.top,Trousers:avatar.pants,Shoes:avatar.shoes}[role];
    if(!source)return original;
    const references={Skin:'#e5b896',Hair:'#574034',Top:'#bdc9b5',Trousers:'#677d78',Shoes:'#eee5d1'};
    const key=`${original.uuid}:${source}`;
    if(!materials.has(key)){
      const next=original.clone(),reference=new THREE.Color(references[role]),color=new THREE.Color(source);
      if(original.userData.normalized_tint)next.color.copy(color);
      else for(const axis of ['r','g','b'])next.color[axis]=Math.min(3,color[axis]/Math.max(.025,reference[axis]));
      materials.set(key,next);
    }
    return materials.get(key);
  }
  if (role.startsWith('ArtSkin') || role.startsWith('ArtHair') || role.startsWith('ArtBrows')) {
    const color = role.startsWith('ArtSkin') ? avatar.skin : avatar.hairColor;
    const key = `${original.uuid}:${color}`;
    if (!materials.has(key)) {
      const next = original.clone();
      const reference = new THREE.Color(original.userData.tint_reference || (role.startsWith('ArtSkin') ? '#e0ad88' : '#8c6748'));
      next.color.set(color);
      for (const axis of ['r', 'g', 'b']) next.color[axis] = Math.min(2.3, next.color[axis] / Math.max(0.025, reference[axis]));
      materials.set(key, next);
    }
    return materials.get(key);
  }
  const source = {
    Skin: avatar.skin, SkinShade: avatar.skin, Hair: avatar.hairColor, HairLight: avatar.hairColor,
    Brows: avatar.hairColor, Top: avatar.top, TopShade: avatar.top, Trousers: avatar.pants,
    TrouserCuff: avatar.pants, Shoes: avatar.shoes, Lips: avatar.skin,
  }[role];
  if (!source) return original;
  const key = `${original.uuid}:${source}`;
  if (!materials.has(key)) {
    const next = original.clone();
    next.color.set(source);
    if (['SkinShade', 'TopShade', 'TrouserCuff'].includes(role)) next.color.multiplyScalar(0.78);
    if (role === 'HairLight') next.color.lerp(new THREE.Color('#c29e72'), 0.2);
    if (role === 'Brows') next.color.multiplyScalar(0.62);
    if (role === 'Lips') next.color.multiplyScalar(0.64).lerp(new THREE.Color('#a26759'), 0.2);
    materials.set(key, next);
  }
  return materials.get(key);
}

export function createResidentModel(avatar) {
  if (!residentAsset) return null;
  const root = new THREE.Group();
  root.name = 'Resident';
  const rig = clone(residentAsset.scene);
  root.add(rig);
  root.scale.setScalar(avatar.height);
  let skin;
  const accessories = new Map(), bones = new Map();
  rig.traverse(node => {
    if (node.isBone) bones.set(node.name, node);
    const { variant, accessory } = node.userData;
    if (variant) node.visible = variant.startsWith('hair:')
      ? variant === `hair:${avatar.hair}` : variant === (avatar.outfit || 'jacket');
    if (accessory) {
      node.visible = accessory === 'glasses' && avatar.glasses;
      if (!accessories.has(accessory)) accessories.set(accessory, []);
      accessories.get(accessory).push(node);
    }
    if (node.userData.base && node.userData.base !== (avatar.base || 'female')) node.visible = false;
    if (node.isSkinnedMesh && !skin) skin = node;
    if (node.isMesh) {
      node.material = Array.isArray(node.material) ? node.material.map(m => coloredMaterial(m, avatar)) : coloredMaterial(node.material, avatar);
      node.castShadow = true;
      node.receiveShadow = false;
    }
  });
  const controller = new ResidentAnimator(root, rig, skin, bones, accessories, avatar);
  root.userData = {
    controller, source: 'blender-resident',
    head: bones.get('Head'), torso: bones.get('Chest'),
    arms: [bones.get('UpperArm_L'), bones.get('UpperArm_R')],
    legs: [bones.get('Thigh_L'), bones.get('Thigh_R')],
    portraitTarget: [0, layout.eyeHeight * avatar.height, 0.035 + layout.headForward],
    portraitExtent: 0.8 * avatar.height,
  };
  controller.update(0);
  return root;
}

class ResidentAnimator {
  constructor(root, rig, skin, bones, accessories, avatar) {
    this.root = root;
    this.rig = rig;
    this.bones = bones;
    this.accessories = accessories;
    this.avatar = avatar;
    this.mixer = new THREE.AnimationMixer(rig);
    this.actions = new Map(residentAsset.animations.map(clip => [clip.name, this.mixer.clipAction(clip)]));
    this.basePose = [...bones.values()].map(bone => ({
      bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone(),
    }));
    this.time = 0;
    this.play('Idle', 0);
    const indices = Object.fromEntries(skin.skeleton.bones.map((bone, index) => [bone.name, index]));
    this.ik = new CCDIKSolver(skin, [{
      target: indices.HandTarget, effector: indices.UtensilTip, iteration: 12, maxAngle: 0.15,
      links: [{ index: indices.Hand_R }, { index: indices.Forearm_R }, { index: indices.UpperArm_R }],
    }]);
    this.washIK = new CCDIKSolver(skin, ['L','R'].map(side=>({
      target:indices[`WashTarget_${side}`],effector:indices[`Palm_${side}`],iteration:24,maxAngle:.22,
      links:[{index:indices[`Hand_${side}`]},{index:indices[`Forearm_${side}`]},{index:indices[`UpperArm_${side}`]}],
    })));
  }

  play(name, fade = 0.15) {
    if (this.name === name) return;
    const action = this.actions.get(name);
    if (!action) return;
    action.reset();
    const once = ['SitDown', 'StandUp'].includes(name);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (this.active && fade) action.crossFadeFrom(this.active, fade, false);
    else this.active?.stop();
    this.active = action;
    this.name = name;
  }

  showAccessory(name, visible) {
    for (const node of this.accessories.get(name) || [])
      node.visible = visible && (!node.userData.base || node.userData.base === (this.avatar.base || 'female'));
  }

  seatOffset(seatTop = 0.57) {
    return seatTop - 0.57 * this.avatar.height;
  }

  update(delta, seatedWeight = 0, seatTop = 0.57) {
    this.time += delta;
    this.washTargets=null;
    // Mixer bindings cache unchanged tracks; restore their pose before applying IK
    // or body-shape corrections so those corrections cannot accumulate.
    for (const pose of this.basePose) {
      pose.bone.position.copy(pose.position);
      pose.bone.quaternion.copy(pose.quaternion);
      pose.bone.scale.copy(pose.scale);
    }
    this.mixer.update(delta);
    for (const pose of this.basePose) {
      pose.position.copy(pose.bone.position);
      pose.quaternion.copy(pose.bone.quaternion);
      pose.scale.copy(pose.bone.scale);
    }
    const { avatar, bones } = this;
    bones.get('Chest').scale.x = avatar.build;
    bones.get('Neck').scale.x = 1 / avatar.build;
    bones.get('Head').scale.x = avatar.face;
    bones.get('Nose').scale.setScalar(avatar.nose);
    const blinkPhase = this.time % 4.7;
    const blink = blinkPhase > 4.48 ? Math.max(0.1, Math.abs((blinkPhase - 4.59) / 0.11)) : 1;
    for (const name of ['Eye_L', 'Eye_R']) bones.get(name).scale.set(avatar.eyes, avatar.eyes * blink, avatar.eyes);
    if (seatedWeight > 0) {
      const desired = Math.acos(THREE.MathUtils.clamp((seatTop / avatar.height - 0.51) / 0.5, -0.2, 0.8));
      const thigh = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (1.45 - desired) * seatedWeight);
      const shin = thigh.clone().invert();
      for (const side of ['L', 'R']) {
        bones.get(`Thigh_${side}`).quaternion.multiply(thigh);
        bones.get(`Shin_${side}`).quaternion.multiply(shin);
      }
    }
    this.root.updateMatrixWorld(true);
  }

  reach(target) {
    const goal = this.bones.get('HandTarget');
    goal.position.copy(goal.parent.worldToLocal(target.clone()));
    goal.updateMatrixWorld(true);
    this.ik.update();
    this.root.updateMatrixWorld(true);
    this.lastTarget = target.clone();
  }

  idlePose() {
    const phase=this.time%24;
    const glance=Math.sin(Math.max(0,phase-3)*.7)*THREE.MathUtils.smoothstep(phase,3,5)*(1-THREE.MathUtils.smoothstep(phase,8,10));
    const stretch=Math.sin(THREE.MathUtils.clamp((phase-15)/4,0,1)*Math.PI);
    this.bones.get('Head').rotation.y+=glance*.16;
    this.bones.get('Neck').rotation.x-=stretch*.035;
    for(const [i,side] of ['L','R'].entries()){
      this.bones.get(`UpperArm_${side}`).rotation.z+=(i?1:-1)*stretch*.055;
      this.bones.get(`Forearm_${side}`).rotation.x-=stretch*.10;
    }
    this.root.updateMatrixWorld(true);
  }
  discomfortPose(severity=1){
    this.bones.get('Head').rotation.x+=.14*severity;
    this.bones.get('Chest').rotation.x+=.04*severity;
    for(const side of ['L','R'])this.bones.get(`Forearm_${side}`).rotation.x-=.15*severity;
    this.root.updateMatrixWorld(true);
  }

  point(name) {
    return this.bones.get(name).getWorldPosition(new THREE.Vector3());
  }

  closeEyes(amount) {
    for (const name of ['Eye_L', 'Eye_R']) this.bones.get(name).scale.y *= 1 - amount * 0.94;
    this.root.updateMatrixWorld(true);
  }

  sleepWear(sleeping) {
    this.showAccessory('sleep-socks',sleeping);
    this.rig.traverse(node => {
      if (['Shoes', 'Sole'].includes(node.userData.role))
        node.visible = !sleeping && (!node.userData.base || node.userData.base === (this.avatar.base || 'female'));
    });
  }

  bedPose(pose) {
    const rotate=(name,x,z=0)=>this.bones.get(name).quaternion.multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(x,0,z)));
    const thigh=-THREE.MathUtils.lerp(pose.seatedAngle,Math.PI/2,pose.legs)*pose.sit*(1-pose.recline);
    const shin=pose.seatedAngle*pose.sit*(1-pose.legs);
    for(const [i,side] of ['L','R'].entries()) {
      rotate(`Thigh_${side}`,thigh);
      rotate(`Shin_${side}`,shin);
      rotate(`Foot_${side}`,1.4*pose.legs);
      rotate(`UpperArm_${side}`,-0.05*pose.sit,(i?1:-1)*0.07*pose.sit);
      rotate(`Forearm_${side}`,-0.06*pose.sit);
    }
    rotate('Chest',0.025*pose.recline);
    rotate('Neck',0.07*pose.recline);
    this.root.updateMatrixWorld(true);
  }

  anchorHips(target,rotation) {
    this.root.position.set(0,0,0);
    this.root.quaternion.copy(rotation);
    this.root.updateMatrixWorld(true);
    const offset=this.point('Hips');
    this.root.position.copy(target).sub(offset);
    this.root.updateMatrixWorld(true);
  }

  handwashPose(targets, time, weight = 1) {
    const lean=THREE.MathUtils.lerp(.56,.76,THREE.MathUtils.clamp((this.avatar.height-.85)/.3,0,1))*weight;
    this.bones.get('Spine').rotation.x+=lean;
    this.bones.get('Neck').rotation.x+=.12*weight;
    for(const [i,side] of ['L','R'].entries()) {
      this.bones.get(`UpperArm_${side}`).rotation.x-=.7*weight;
      this.bones.get(`UpperArm_${side}`).rotation.z+=(i?.18:-.18)*weight;
      this.bones.get(`Forearm_${side}`).rotation.x-=.7*weight;
      this.bones.get(`Hand_${side}`).rotation.y+=Math.sin(time*9+i)*.25*weight;
    }
    this.root.updateMatrixWorld(true);
    for(const [side,key] of [['L','left'],['R','right']]) {
      const goal=this.bones.get(`WashTarget_${side}`);
      const target=this.point(`Palm_${side}`).lerp(targets[key],weight);
      goal.position.copy(goal.parent.worldToLocal(target));
      goal.updateMatrixWorld(true);
    }
    this.washIK.update();
    this.root.updateMatrixWorld(true);
    this.washTargets=weight>0?targets:null;
    return {left:this.point('Palm_L'),right:this.point('Palm_R')};
  }

  typingPose(targets, time, weight=1) {
    this.bones.get('Spine').rotation.x+=.12*weight;
    this.bones.get('Head').rotation.x+=.06*weight;
    for(const side of ['L','R']) {
      this.bones.get(`UpperArm_${side}`).rotation.x-=.3*weight;
      this.bones.get(`Forearm_${side}`).rotation.x-=.45*weight;
    }
    this.root.updateMatrixWorld(true);
    for(const [side,key] of [['L','left'],['R','right']]) {
      const goal=this.bones.get(`WashTarget_${side}`);
      const target=this.point(`Palm_${side}`).lerp(targets[key],weight);
      goal.position.copy(goal.parent.worldToLocal(target));
      goal.updateMatrixWorld(true);
    }
    this.washIK.update();
    this.root.updateMatrixWorld(true);
    this.washTargets=weight>0?targets:null;
  }

  washPose(time) {
    for (const [i, side] of ['L', 'R'].entries()) {
      const arm = this.bones.get(`UpperArm_${side}`), forearm = this.bones.get(`Forearm_${side}`);
      arm.rotation.x -= 0.7 + Math.sin(time * 2.5 + i * Math.PI) * 0.2;
      arm.rotation.z += (i ? -1 : 1) * 0.2;
      forearm.rotation.x -= 1.5 + Math.sin(time * 2.5 + i * Math.PI) * 0.3;
    }
    this.bones.get('Head').rotation.x += Math.sin(time * 1.8) * 0.06;
    this.root.updateMatrixWorld(true);
  }

  fishingPose(time) {
    const cast = time < 2 ? Math.sin(time / 2 * Math.PI) : 0;
    const reel = time > 12 ? Math.sin(time * 6) * 0.12 : Math.sin(time) * 0.025;
    for (const [i,side] of ['L','R'].entries()) {
      this.bones.get(`UpperArm_${side}`).rotation.x -= 0.85 + cast * 0.8;
      this.bones.get(`UpperArm_${side}`).rotation.z += i ? 0.18 : -0.3;
      this.bones.get(`Forearm_${side}`).rotation.x -= 1.15 + (i ? reel : -reel);
    }
    this.bones.get('Head').rotation.x += 0.08;
    this.root.updateMatrixWorld(true);
  }

  diagnostics() {
    const tip = this.point('UtensilTip');
    return {
      source: 'blender-resident', clip: this.name,
      bones: this.bones.size, height: this.avatar.height, outfit: this.avatar.outfit || 'jacket', base: this.avatar.base || 'female',
      artist: activeManifest.artist || 'Sunny Life',
      mouth: this.point('Mouth').toArray(), hand: this.point('Hand_R').toArray(),
      hips: this.point('Hips').toArray(), head: this.point('Head').toArray(),
      shoulders: ['UpperArm_L','UpperArm_R'].map(name=>this.point(name).toArray()),
      fork: tip.toArray(), target: this.lastTarget?.toArray() || null,
      targetDistance: this.lastTarget ? tip.distanceTo(this.lastTarget) : null,
      feet: ['Foot_L', 'Foot_R'].map(name => this.point(name).toArray()),
      knees:['Shin_L','Shin_R'].map(name=>this.point(name).toArray()),
      palms:['Palm_L','Palm_R'].map(name=>this.point(name).toArray()),
      washDistances:this.washTargets?['left','right'].map((key,i)=>this.point(i?'Palm_R':'Palm_L').distanceTo(this.washTargets[key])):null,
    };
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.rig);
    const skeletons = new Set();
    this.rig.traverse(node => { if (node.isSkinnedMesh) skeletons.add(node.skeleton); });
    skeletons.forEach(skeleton => skeleton.dispose());
  }
}

export function residentAssetStatus() {
  return { loaded: !!residentAsset, error: loadError || null, generator: activeManifest.generator,localOnly:!!activeManifest.localOnly };
}

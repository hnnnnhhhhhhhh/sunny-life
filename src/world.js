import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { avatarModel, box, disposeModel, furnitureModel, houseModel, material } from './models.js';
import { createRoom, DEFAULT_AVATAR, findPath, footprint, navigationGrid, snap, surfaceHeight, validatePlacement, validateWall } from './game.js';
import { PLOT, roomFromPoints } from './architecture.js';
import { blenderAssetStatus } from './model-assets.js';
import { createEnvironment } from './environment.js';
import { layout, terrainHeight, terrainSurface } from './terrain.js';
import { ActivityRunner } from './activity-runner.js';
import { Autonomy } from './autonomy.js';
import { ActionQueue } from './action-queue.js';
import residentLayout from './resident-layout.json' with { type:'json' };
import { apartmentWalkable, isApartment } from './residence.js';
import { createApartmentEnvironment, createApartmentGrid, dressApartment } from './apartment-models.js';
import { createHomeLighting, daylightAt } from './daylight.js';

export class World {
  constructor(container, emit) {
    this.container = container;
    this.emit = emit;
    this.items = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
    this.intersection = new THREE.Vector3();
    this.path = [];
    this.frame = 0;
    this.lastTime = 0;
    this.lastPositionEmit = 0;
    this.targetZoom = 1;
    this.disposed = false;
    this.activities = new ActivityRunner(this);
    this.autonomy = new Autonomy(this);
    this.queue = new ActionQueue(this);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#c4d7d3');
    this.scene.fog = new THREE.Fog('#c4d7d3', 65, 190);
    const lowQuality=new URLSearchParams(window.location.search).get('quality')==='low' || navigator.hardwareConcurrency<=4;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(lowQuality?0.5:Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = !lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.setAttribute('aria-label', '晴屿三维世界');
    this.renderer.domElement.setAttribute('data-testid', 'world-canvas');
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.OrthographicCamera(-20, 20, 16, -16, 0.1, 1500);
    this.camera.position.set(21, 26, 30);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(1.4, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = 1.46;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 110;
    this.controls.minZoom = 0.4;
    this.controls.maxZoom = 2.6;
    this.controls.zoomSpeed = 0.75;
    this.controls.panSpeed = 0.75;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('change', () => {
      if (!this.cameraTransition) this.targetZoom = this.camera.zoom;
    });
    this.controls.addEventListener('start', () => { this.cameraTransition = null; });
    this.hemi = new THREE.HemisphereLight('#f5f6ef', '#82977b', 1.65);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d5', 3.1);
    this.sun.position.set(-16, 28, 13);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -32; this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 30; this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.camera.near = 0.5; this.sun.shadow.camera.far = 100;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.065;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.environmentSystem = createEnvironment();
    this.environmentSystem.ocean.setQuality(lowQuality);
    this.environment = this.environmentSystem.root;
    this.scene.add(this.environment);
    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.furnitureRoot = new THREE.Group();
    this.worldRoot.add(this.furnitureRoot);
    this.grid = new THREE.GridHelper(21, 42, '#879f7b', '#97b18a');
    this.grid.position.y = 0.258;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.25;
    this.grid.material.depthWrite = false;
    this.worldRoot.add(this.grid);
    this.selection = this.makeOutline('#4e967c');
    this.worldRoot.add(this.selection);
    this.hoverOutline = this.makeOutline('#4e967c');
    this.worldRoot.add(this.hoverOutline);
    this.destination = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.33, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this.destination.rotation.x = -Math.PI / 2;
    this.destination.visible = false;
    this.worldRoot.add(this.destination);
    this.studio = new THREE.Group();
    this.studio.visible = false;
    box(this.studio, 0, -0.16, 0, 100, 0.25, 100, '#e5e9df');
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.67, 0.12, 80), material('#f5f2e8'));
    disc.position.y = -0.035; disc.receiveShadow = true; this.studio.add(disc);
    this.scene.add(this.studio);
    this.npcRoot = new THREE.Group();
    this.environment.add(this.npcRoot);
    const neighbors = [
      { x: 7, z: 10.2, top: '#af8272', hair: 'short', name: '江宁', base: 'male' },
      { x: 4, z: -14, top: '#829cac', hair: 'curly', name: '阿遥' },
      { x: 24, z: 7, top: '#c2b47f', hair: 'short', name: '陈雨', base: 'male' },
    ];
    this.npcs = neighbors.map((data, i) => {
      const id = `neighbor-${i + 1}`;
      const mesh = avatarModel({ ...DEFAULT_AVATAR, ...data, height: 0.88 });
      mesh.position.set(data.x, terrainHeight(data.x, data.z) + 0.04, data.z); mesh.rotation.y = i + 1;
      mesh.traverse(child => { child.userData.npcName = data.name; child.userData.npcId = id; });
      this.npcRoot.add(mesh); return { id, mesh, data, coastalPosition:{x:data.x,z:data.z}, phase: i * 2, busy: false };
    });
    this.emitNeighbors();
    this.pointerDown = event => {
      if (event.isPrimary === false) { this.cancelDraw(); return; }
      this.down = { x: event.clientX, y: event.clientY, button: event.button };
      if (event.button === 0 && this.state?.mode === 'build' && ['wall', 'room'].includes(this.state.tool) && this.setRay(event)) {
        this.draw = { start: this.state.wallStart || { x: snap(this.intersection.x), z: snap(this.intersection.z) },
          continuing: !!this.state.wallStart, tool: this.state.tool };
        this.controls.enabled = false;
        this.cameraTransition = null;
        this.renderer.domElement.setPointerCapture(event.pointerId);
      }
    };
    this.pointerMove = event => this.onMove(event);
    this.pointerUp = event => this.onClick(event);
    this.contextMenu = event => event.preventDefault();
    this.pointerLeave = () => { if (this.preview) this.preview.visible = false; this.hoverOutline.visible = false; };
    this.pointerCancel = () => this.cancelDraw();
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.pointerDown, true);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointerleave', this.pointerLeave);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('contextmenu', this.contextMenu);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate(0);
  }

  makeOutline(color) {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.035, 1));
    const result = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    result.visible = false;
    return result;
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.width = width; this.height = height;
    this.renderer.setSize(width, height);
    this.updateProjection();
  }

  updateProjection() {
    const studio = this.state?.mode === 'avatar';
    const mobile = this.width < 760;
    const apartment=isApartment(this.state?.game.home);
    const span = studio ? (mobile ? 7 : 4.6) : mobile ? apartment?Math.max(28,18/(this.width/this.height)):Math.max(43,23/(this.width/this.height)) : 34;
    const aspect = this.width / this.height;
    if (this.camera.isOrthographicCamera) {
      this.camera.left = -span * aspect / 2; this.camera.right = span * aspect / 2;
      this.camera.top = span / 2; this.camera.bottom = -span / 2;
    } else this.camera.aspect = aspect;
    // Offset the projection, keeping the interactive scene clear of editor surfaces.
    const offsetX = mobile ? 0 : studio ? 115 : this.state?.propertiesOpen ? 110 : 0;
    const offsetY = mobile ? studio ? this.height * 0.17 : 25 : this.state?.mode === 'build' && this.state?.catalogOpen ? 42 : 0;
    this.camera.setViewOffset(this.width, this.height, offsetX, offsetY, this.width, this.height);
    this.camera.updateProjectionMatrix();
  }

  update(state) {
    const old = this.state;
    this.state = state;
    const { game, mode, selected, pending, roof } = state;
    const { home, avatar } = game;
    const apartment=isApartment(home),residenceChanged=apartment!==isApartment(old?.game.home);
    if(state.lowQuality!==old?.lowQuality) {
      this.renderer.setPixelRatio(state.lowQuality?0.5:Math.min(window.devicePixelRatio,1.75));
      this.renderer.shadowMap.enabled=!state.lowQuality;
      const shadowSize=state.lowQuality?512:2048;
      this.sun.shadow.mapSize.set(shadowSize,shadowSize);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map=null;
      this.environmentSystem.ocean.setQuality(state.lowQuality);
      this.resize();
    }
    if (!game.sim.autonomy && this.activities.current?.autonomous && this.activities.current.stage !== 'cancelling') this.activities.cancel(false);
    if (state.propertiesOpen !== old?.propertiesOpen || state.catalogOpen !== old?.catalogOpen) this.updateProjection();
    if (this.activities.current && (mode !== old?.mode || home !== old?.game.home || avatar !== old?.game.avatar || state.loadVersion !== old?.loadVersion)) {
      this.activities.cancel(true, undefined, true);
    }
    if (old && (mode !== old.mode || state.loadVersion !== old.loadVersion)) this.queue.clear();
    if(apartment&&!this.apartmentSystem) {
      this.apartmentSystem=createApartmentEnvironment();
      this.scene.add(this.apartmentSystem.root);
      this.apartmentGrid=createApartmentGrid();
      this.worldRoot.add(this.apartmentGrid);
    }
    if(residenceChanged||!old) {
      this.npcRoot.visible=!apartment;
      this.npcs.forEach(npc=>{
        Object.assign(npc.data,npc.coastalPosition);
        npc.mesh.position.set(npc.data.x,terrainHeight(npc.data.x,npc.data.z)+.04,npc.data.z);
        npc.busy=false;
      });
      this.emitNeighbors();
    }
    this.environment.visible=mode!=='avatar'&&!apartment;
    if(this.apartmentSystem) {
      this.apartmentSystem.root.visible=mode!=='avatar'&&apartment;
      this.apartmentSystem.setExterior(!!state.apartmentExterior&&mode!=='build');
    }
    const houseKey = JSON.stringify([home.residence,home.width, home.depth, home.foundation, home.rooms, home.removedExterior, home.exteriorEdits, home.floor, home.wallColor, home.walls, roof]);
    if (houseKey !== this.houseKey) {
      if (this.house) { this.worldRoot.remove(this.house); disposeModel(this.house); }
      this.house = houseModel(home, roof);
      if(apartment)dressApartment(this.house,home);
      this.worldRoot.add(this.house);
      this.houseKey = houseKey;
    }
    if (home !== old?.game.home) {
      if(this.homeLighting){this.worldRoot.remove(this.homeLighting.root);disposeModel(this.homeLighting.root);}
      this.homeLighting=createHomeLighting(home,(x,z)=>surfaceHeight(home,x,z));
      this.worldRoot.add(this.homeLighting.root);
      this.navGrid = navigationGrid(home);
      this.autonomy.manual();
      this.environmentSystem.grass.updateHome(home);
      this.path = [];
      this.destination.visible = false;
      const ids = new Set(home.furniture.map(f => f.id));
      for (const [id, entry] of this.items) if (!ids.has(id)) {
        this.furnitureRoot.remove(entry.mesh); disposeModel(entry.mesh); this.items.delete(id);
      }
      for (const object of home.furniture) {
        let entry = this.items.get(object.id);
        const signature = `${object.type}:${object.color}`;
        if (!entry || entry.signature !== signature) {
          if (entry) { this.furnitureRoot.remove(entry.mesh); disposeModel(entry.mesh); }
          const mesh = furnitureModel(object.type, object.color);
          mesh.traverse(child => { child.userData.furnitureId = object.id; });
          this.furnitureRoot.add(mesh);
          entry = { mesh, signature }; this.items.set(object.id, entry);
        }
        entry.mesh.position.set(object.x, surfaceHeight(home, object.x, object.z), object.z);
        entry.mesh.rotation.y = object.rotation;
      }
    }
    for (const [id, entry] of this.items) entry.mesh.visible = pending?.movingId !== id;
    if (avatar !== old?.game.avatar || !this.player || state.loadVersion !== old?.loadVersion) {
      const pos = this.player?.position.clone();
      if (this.player) { this.player.userData.controller?.dispose(); this.worldRoot.remove(this.player); }
      this.player = avatarModel(avatar);
      this.player.position.copy(pos || new THREE.Vector3(game.sim.x, surfaceHeight(home, game.sim.x, game.sim.z), game.sim.z));
      if (state.loadVersion !== old?.loadVersion) this.player.position.set(game.sim.x, surfaceHeight(home, game.sim.x, game.sim.z), game.sim.z);
      this.player.rotation.y = 0.3;
      this.worldRoot.add(this.player);
    }
    if (!this.marker) {
      this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.135), material('#69ac85', { roughness: 0.3, metalness: 0.1 }));
      this.worldRoot.add(this.marker);
    }
    if (state.draft !== old?.draft || !this.studioAvatar) {
      if (this.studioAvatar) { this.studioAvatar.userData.controller?.dispose(); this.studio.remove(this.studioAvatar); }
      this.studioAvatar = avatarModel(state.draft || avatar);
      this.studioAvatar.rotation.y = 0.15;
      this.studio.add(this.studioAvatar);
    }
    this.grid.visible = mode === 'build' && state.showGrid && !roof && !apartment;
    if(this.apartmentGrid)this.apartmentGrid.visible=mode==='build'&&state.showGrid&&apartment;
    this.selection.visible = !!selected && mode === 'build' && !pending;
    if (this.selection.visible) {
      const object = home.furniture.find(f => f.id === selected);
      if (object) {
        const size = footprint(object);
        this.selection.scale.set(size.width + 0.14, 1, size.depth + 0.14);
        this.selection.position.set(object.x, surfaceHeight(home, object.x, object.z) + 0.035, object.z);
      } else this.selection.visible = false;
    }
    const pendingKey = pending ? `${pending.type}:${pending.color}:${pending.rotation}` : '';
    if (pendingKey !== this.pendingKey) {
      this.removePreview();
      if (pending) {
        this.preview = furnitureModel(pending.type, pending.color);
        this.preview.traverse(child => {
          if (!child.isMesh) return;
          child.material = child.material.clone();
          child.material.transparent = true; child.material.opacity = 0.64;
          child.material.depthWrite = false; child.castShadow = false;
          child.userData.ownMaterial = true;
        });
        this.preview.rotation.y = pending.rotation;
        this.preview.visible = false;
        this.worldRoot.add(this.preview);
      }
      this.pendingKey = pendingKey;
      if (this.lastPointer) this.onMove(this.lastPointer);
    }
    if (state.tool !== old?.tool || mode !== old?.mode) this.cancelDraw();
    if (!state.wallStart && !this.draw) this.hoverOutline.visible = !!pending && this.hoverOutline.visible;
    const drawing = mode === 'build' && ['wall', 'room'].includes(state.tool);
    this.controls.mouseButtons.LEFT = drawing ? null : THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = drawing ? null : THREE.TOUCH.ROTATE;
    if (mode !== old?.mode || residenceChanged) {
      this.path = []; this.destination.visible = false;
      const studio = mode === 'avatar';
      this.environment.visible = !studio&&!apartment; this.worldRoot.visible = !studio; this.studio.visible = studio;
      this.scene.background.set(studio ? '#e5e9df' : '#c4d7d3');
      this.controls.maxZoom = studio ? 3.5 : mode === 'live' ? 4 : 2.6;
      this.controls.minZoom = studio ? 0.75 : 0.4;
      this.controls.enablePan = !studio;
      this.controls.maxPolarAngle = studio ? Math.PI / 1.9 : 1.46;
      this.cameraTransition = {
        target: new THREE.Vector3(studio ? 0 : 1.4, studio ? 1.2 : 0, 0),
        position: studio ? new THREE.Vector3(3.2, 2.65, 7) : new THREE.Vector3(21, 26, 30),
        zoom: 1,
      };
      if(apartment&&!studio)this.command(state.apartmentExterior?'apartmentExterior':'home');
      this.updateProjection();
    }
    this.updateDaylight();
    this.renderer.domElement.style.cursor = pending || drawing || ['door', 'window'].includes(state.tool) ? 'crosshair' : state.tool === 'delete' ? 'not-allowed' : 'grab';
  }

  cancelDraw() {
    this.draw = null; this.down = null;
    this.controls.enabled = true;
    this.hoverOutline.visible = false;
  }

  setRay(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, this.intersection);
  }

  onMove(event) {
    this.lastPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!this.state || this.state.mode !== 'build' || !this.setRay(event)) return;
    const { pending, game, tool } = this.state;
    const wallStart = this.draw?.start || this.state.wallStart;
    const x = snap(this.intersection.x), z = snap(this.intersection.z);
    if (pending && this.preview) {
      const object = { ...pending, x, z };
      this.placementError = validatePlacement(game.home, object, pending.movingId);
      this.preview.visible = true;
      this.preview.position.set(x, surfaceHeight(game.home, x, z) + 0.02, z);
      this.hoverOutline.visible = true;
      const size = footprint(object);
      this.hoverOutline.scale.set(size.width + 0.12, 1, size.depth + 0.12);
      this.hoverOutline.position.set(x, surfaceHeight(game.home, x, z) + 0.04, z);
      this.hoverOutline.material.color.set(this.placementError ? '#c36551' : '#4e967c');
    } else if (['wall', 'room'].includes(tool) && wallStart) {
      const end = tool === 'room' ? roomFromPoints(wallStart, { x, z }, 'preview') : this.wallEnd(x, z, wallStart);
      const error = tool === 'room' ? createRoom(game.home, end).error : validateWall(game.home, end);
      this.hoverOutline.visible = true;
      this.hoverOutline.scale.set(Math.abs(end.x2 - end.x1) || 0.16, 82, Math.abs(end.z2 - end.z1) || 0.16);
      this.hoverOutline.position.set((end.x1 + end.x2) / 2, 1.7, (end.z1 + end.z2) / 2);
      this.hoverOutline.material.color.set(error ? '#c36551' : '#4e967c');
    }
  }

  wallEnd(x, z, start = this.state.wallStart) {
    return Math.abs(x - start.x) >= Math.abs(z - start.z)
      ? { x1: start.x, z1: start.z, x2: x, z2: start.z }
      : { x1: start.x, z1: start.z, x2: start.x, z2: z };
  }

  onClick(event) {
    if (this.draw) {
      const draw = this.draw, down = this.down;
      const moved = down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6;
      this.cancelDraw();
      if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId);
      if (!this.setRay(event)) return;
      const end = { x: snap(this.intersection.x), z: snap(this.intersection.z) };
      if (Math.abs(draw.start.x) > PLOT.x || Math.abs(draw.start.z) > PLOT.z) {
        this.emit({ type: 'toast', message: '请在自家地块内开始建造' }); return;
      }
      if (!draw.continuing && !moved) this.emit({ type: 'wallStart', ...end });
      else if (draw.tool === 'room') this.emit({ type: 'room', room: roomFromPoints(draw.start, end) });
      else this.emit({ type: 'wall', wall: this.wallEnd(end.x, end.z, draw.start) });
      return;
    }
    if (!this.state || !this.down || this.down.button !== 0 ||
      Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6 || this.state.mode === 'avatar') return;
    this.down = null;
    if (!this.setRay(event)) return;
    const x = snap(this.intersection.x), z = snap(this.intersection.z);
    const { mode, tool, pending, game } = this.state;
    if(isApartment(game.home)&&this.state.apartmentExterior&&mode==='live') {
      this.emit({type:'apartmentView',exterior:false});this.command('home');return;
    }
    if (mode === 'build' && pending) {
      const error = validatePlacement(game.home, { ...pending, x, z }, pending.movingId);
      this.emit(error ? { type: 'toast', message: error } : { type: 'place', x, z });
      return;
    }
    const hit = this.raycaster.intersectObjects(this.furnitureRoot.children, true).find(h => h.object.userData.furnitureId && this.items.get(h.object.userData.furnitureId)?.mesh.visible);
    const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };
    const houseHits = this.raycaster.intersectObject(this.house, true).filter(h => visible(h.object));
    const wallHit = ['delete', 'door', 'window'].includes(tool) && houseHits.find(h => h.object.userData.wallId);
    if (mode === 'build') {
      if (['door', 'window'].includes(tool)) {
        if (wallHit) this.emit({ type: 'opening', id: wallHit.object.userData.wallId, kind: tool, point: { x: snap(wallHit.point.x), z: snap(wallHit.point.z) } });
        else this.emit({ type: 'toast', message: '请选择一面墙体' });
      } else if (wallHit && (!hit || wallHit.distance < hit.distance)) this.emit({ type: 'removeWall', id: wallHit.object.userData.wallId });
      else if (hit) this.emit({ type: tool === 'delete' ? 'remove' : tool === 'move' ? 'move' : 'select', id: hit.object.userData.furnitureId });
      else if (tool === 'delete' && houseHits.some(h => h.object.userData.floorId)) this.emit({ type: 'removeFloor', id: houseHits.find(h => h.object.userData.floorId).object.userData.floorId });
      else this.emit({ type: 'select', id: null });
    } else {
      this.autonomy.manual();
      const npcHit = this.npcRoot.visible && this.raycaster.intersectObject(this.npcRoot, true)[0];
      if (hit && (!npcHit || hit.distance < npcHit.distance)) this.emit({ type: 'interact', id: hit.object.userData.furnitureId, anchor: { x: event.clientX, y: event.clientY } });
      else if (npcHit) this.startChat(npcHit.object.userData.npcId);
      else {
        this.emit({ type: 'dismissInteraction' });
        const apartment=isApartment(game.home);
        const surfaces=apartment?this.apartmentSystem.surfaces:[...this.environmentSystem.surfaces,this.environmentSystem.water];
        const surface = this.raycaster.intersectObjects([...this.house.userData.floorSurfaces,...surfaces],false)[0];
        if (surface && surface.object !== this.environmentSystem.water) this.walkTo({ x: surface.point.x, z: surface.point.z });
        else this.emit({ type: 'toast', message: apartment?'请选择套内、阳台或公共走廊':'河面不能步行，请沿木桥通行' });
      }
    }
  }

  walkTo(target, activity) {
    return this.queue.add({ kind:'walk',target,activity });
  }

  navigateTo(target) {
    if(isApartment(this.state.game.home)&&!apartmentWalkable(target.x,target.z))return false;
    if (terrainSurface(target.x, target.z).kind === 'water') {
      this.emit({ type: 'toast', message: '河面不能步行，请沿木桥通行' });
      return false;
    }
    const from = { x: this.player.position.x, z: this.player.position.z };
    const path = findPath(this.state.game.home, from, target, this.navGrid);
    if (!path.length) { this.emit({ type: 'toast', message: '暂时无法到达这里，试试附近的空地' }); return false; }
    this.path = path; this.arrivalActivity = null;
    const end = path[path.length - 1];
    this.destination.position.set(end.x, surfaceHeight(this.state.game.home, end.x, end.z) + 0.025, end.z);
    this.destination.visible = true;
    this.emit({ type: 'walking' });
    return true;
  }

  startActivity(id, recipe, activity) {
    return this.queue.add({ kind:'furniture',targetId:id,recipe,activity });
  }

  startChat(id) {
    if(isApartment(this.state.game.home))return false;
    return this.queue.add({ kind:'chat',targetId:id });
  }

  startOnlineChat() {
    const desk=this.state.game.home.furniture.find(f=>f.type==='desk');
    if(!desk){this.emit({type:'toast',message:'家中还没有电脑桌，可在卧室家具中放置'});return false;}
    return this.startActivity(desk.id,undefined,'onlineChat');
  }

  startFishing(id) {
    if(isApartment(this.state.game.home)){this.emit({type:'toast',message:'钓鱼可在海岸住宅进行'});return false;}
    return this.queue.add({ kind:'fish',targetId:id });
  }

  emitNeighbors() {
    this.emit({ type: 'neighbors', neighbors: isApartment(this.state?.game.home)?[]:this.npcs.map(npc => ({ id: npc.id, name: npc.data.name, busy: npc.busy })) });
  }

  cancelActivity() {
    this.autonomy.manual();
    if (this.activities.current) this.activities.cancel(false);
    else { this.path=[]; this.destination.visible=false; this.emit({ type:'arrived' }); }
  }

  command(action, place) {
    const apartment=isApartment(this.state?.game.home);
    if(apartment&&['home','follow','dining','activity','television','computer'].includes(action))this.emit({type:'apartmentView',exterior:false});
    if(apartment&&action==='apartmentExterior') {
      this.cameraTransition={position:new THREE.Vector3(24,16,32),target:new THREE.Vector3(0,-1.8,0),zoom:this.width<760?.8:1.3};
      return;
    }
    if(apartment&&action==='home') {
      this.cameraTransition={position:new THREE.Vector3(17,22,26),target:new THREE.Vector3(.5,.9,.7),zoom:this.width<760?1.1:1.9};
      return;
    }
    if (action === 'home') {
      this.cameraTransition = { position: new THREE.Vector3(21, 26, 30), target: new THREE.Vector3(1.4, 0, 0), zoom: 1 };
    } else if (action === 'zoomIn' || action === 'zoomOut') {
      this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (action === 'zoomIn' ? 1.2 : 1 / 1.2), this.controls.minZoom, this.controls.maxZoom);
      this.camera.updateProjectionMatrix();
    } else if (['rotate', 'rotateLeft', 'tiltUp', 'tiltDown'].includes(action)) {
      const offset = this.camera.position.clone().sub(this.controls.target);
      if (action.startsWith('tilt')) {
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + (action === 'tiltUp' ? -0.18 : 0.18), this.controls.minPolarAngle, this.controls.maxPolarAngle);
        offset.setFromSpherical(spherical);
      } else offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), (action === 'rotateLeft' ? -1 : 1) * Math.PI / 4);
      this.cameraTransition = { position: offset.add(this.controls.target), target: this.controls.target.clone(), zoom: this.camera.zoom };
    } else if (action === 'projection') {
      const old = this.camera, distance = old.position.distanceTo(this.controls.target);
      const span = old.isOrthographicCamera ? old.top - old.bottom : 2 * Math.tan(THREE.MathUtils.degToRad(old.fov / 2)) * distance;
      const camera = old.isOrthographicCamera
        ? new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(span / (2 * distance))), this.width / this.height, 0.1, 1500)
        : new THREE.OrthographicCamera(-20, 20, 16, -16, 0.1, 1500);
      camera.position.copy(old.position); camera.quaternion.copy(old.quaternion); camera.zoom = old.zoom;
      this.camera = camera; this.controls.object = camera; this.cameraTransition = null;
      this.updateProjection(); this.controls.update();
      this.emit({ type: 'projection', perspective: camera.isPerspectiveCamera === true });
    } else if (action === 'map') {
      this.cameraTransition = { position: new THREE.Vector3(24, 47, 42), target: new THREE.Vector3(2, 0, 2), zoom: 0.55 };
    } else if (action === 'landmark' && place) {
      const target = new THREE.Vector3(place.cameraX, terrainHeight(place.cameraX, place.cameraZ) + 1.2, place.cameraZ);
      this.cameraTransition = { position: target.clone().add(new THREE.Vector3(21, 26, 30)), target, zoom: place.id === 'tower' ? 2 : 1.25 };
    } else if (action === 'dining' && place) {
      const target = new THREE.Vector3(place.x, place.floor + 0.85, place.z);
      this.cameraTransition = { position: target.clone().add(new THREE.Vector3(19, 16, 17)), target, zoom: 3.1 };
    } else if(action==='computer'&&place) {
      const target=new THREE.Vector3(place.x,place.floor+1,place.z);
      const offset=new THREE.Vector3(15,13,22).applyAxisAngle(new THREE.Vector3(0,1,0),place.rotation);
      this.cameraTransition={position:target.clone().add(offset),target,zoom:3.3};
    } else if (action === 'activity' && place) {
      const target = new THREE.Vector3(place.x, place.floor + 0.8, place.z);
      this.cameraTransition = { position: target.clone().add(new THREE.Vector3(21, 19, 24)), target, zoom: 2.25 };
    } else if (action === 'fishing' && place) {
      const target=new THREE.Vector3(place.approach.x,place.floor+0.4,place.approach.z);
      this.cameraTransition={ position:target.clone().add(new THREE.Vector3(17,14,19)),target,zoom:2.1 };
    } else if (action === 'television' && place) {
      const target = new THREE.Vector3((place.x + place.seat.x) / 2, place.floor + 0.9, (place.z + place.seat.z) / 2);
      const sine = Math.sin(place.rotation), cosine = Math.cos(place.rotation);
      const offset = new THREE.Vector3(sine * 18 - cosine * 14, 32, cosine * 18 + sine * 14);
      this.cameraTransition = { position: target.clone().add(offset), target, zoom: 2.4 };
    } else if (action === 'follow') {
      const target = new THREE.Vector3(this.player.position.x, 0, this.player.position.z);
      this.cameraTransition = { position: target.clone().add(new THREE.Vector3(21, 26, 30)), target, zoom: 1.25 };
    } else if (action === 'portrait') {
      const height = this.state.draft.height;
      const target = new THREE.Vector3(0, residentLayout.eyeHeight * height, 0.035 + residentLayout.headForward);
      this.cameraTransition = { position: target.clone().add(new THREE.Vector3(1.1, 0.21, 6)), target, zoom: Math.min(3.5, 3 / height) };
    } else if (action === 'fullBody') {
      this.cameraTransition = { position: new THREE.Vector3(3.2, 2.65, 7), target: new THREE.Vector3(0, 1.2, 0), zoom: 1 };
    }
  }

  updateDaylight() {
    if(!this.state)return;
    const studio=this.state.mode==='avatar',light=daylightAt(studio?720:this.state.game.sim.time);
    this.lightState=light;
    this.scene.background.copy(studio?new THREE.Color('#e5e9df'):light.sky);
    this.scene.fog.color.copy(this.scene.background);
    this.sun.color.copy(light.sunColor);this.sun.intensity=light.sun;
    this.sun.position.copy(light.sunPosition);
    this.hemi.color.copy(light.sunColor);this.hemi.groundColor.copy(light.ground);this.hemi.intensity=light.ambient;
    this.homeLighting?.update(light.lamps);
    this.homeLighting?.setCeilingVisible(!!this.state.roof||!!this.state.apartmentExterior);
    this.apartmentSystem?.setNight(light.lamps);
    this.environmentSystem.ocean.setDaylight(light);
  }

  animate(time) {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(t => this.animate(t));
    const dt = Math.min((time - this.lastTime) / 1000, 0.25);
    this.lastTime = time;
    if(!isApartment(this.state?.game.home))this.environmentSystem.update(time);
    if (this.cameraTransition) {
      const t = this.cameraTransition;
      const blend=1-Math.exp(-7*dt);
      this.camera.position.lerp(t.position, blend);
      this.controls.target.lerp(t.target, blend);
      this.camera.zoom = THREE.MathUtils.lerp(this.camera.zoom, t.zoom, blend);
      this.camera.updateProjectionMatrix();
      if (this.camera.position.distanceTo(t.position) < 0.015 && Math.abs(this.camera.zoom - t.zoom) < 0.002) this.cameraTransition = null;
    }
    if (this.state && this.player) {
      const { mode, game, speed } = this.state;
      const walking = mode === 'live' && speed > 0 && this.path.length > 0;
      if (walking) {
        const pos = this.player.position;
        let step=dt*2.5*speed;
        while(this.path.length && step>0) {
          const next=this.path[0],dx=next.x-pos.x,dz=next.z-pos.z,distance=Math.hypot(dx,dz);
          if(distance>0.001)this.player.rotation.y=Math.atan2(dx,dz);
          if(distance<=step) {
            pos.x=next.x;pos.z=next.z;this.path.shift();step-=distance;
          } else {
            pos.x+=dx/distance*step;pos.z+=dz/distance*step;step=0;
          }
        }
        if(!this.path.length) {
          this.destination.visible=false;
          this.emit({type:'position',x:pos.x,z:pos.z});
          if(!this.activities.arrive())this.emit({type:'arrived'});
          this.arrivalActivity=null;
        }
        pos.y = surfaceHeight(game.home, pos.x, pos.z) + Math.abs(Math.sin(time * 0.009 * speed)) * 0.026;
        if (time - this.lastPositionEmit > 1500) {
          this.emit({ type: 'position', x: pos.x, z: pos.z }); this.lastPositionEmit = time;
        }
      } else this.player.position.y = surfaceHeight(game.home, this.player.position.x, this.player.position.z);
      this.activities.update(dt * (mode === 'live' ? speed : 1), walking);
      if (!this.player.userData.controller) {
        const swing = walking ? Math.sin(time * 0.009 * speed) * 0.48 : 0;
        this.player.userData.legs.forEach((leg, i) => { leg.rotation.x = swing * (i ? -1 : 1); });
        this.player.userData.arms.forEach((arm, i) => { arm.rotation.x = swing * (i ? 1 : -1) * 0.65; });
      }
      this.marker.position.copy(this.player.userData.controller ? this.player.userData.controller.point('Head') : this.player.position);
      this.marker.position.y += (this.player.userData.controller ? 0.6 : 2.65) * game.avatar.height + Math.sin(time * 0.002) * 0.045;
      this.marker.rotation.y = time * 0.0007;
      if (mode === 'avatar') {
        if (this.studioAvatar.userData.controller) this.studioAvatar.userData.controller.update(dt);
        else {
          this.studioAvatar.userData.head.rotation.y = Math.sin(time * 0.0007) * 0.028;
          this.studioAvatar.userData.arms.forEach((arm, i) => { arm.rotation.z = (i ? 1 : -1) * (0.1 + Math.sin(time * 0.002) * 0.018); });
        }
      }
      this.npcs.forEach(npc => {
        if (mode !== 'live' || !speed || isApartment(game.home)) return;
        const { mesh, data } = npc;
        if (npc.busy) {
          mesh.userData.controller?.play(npc.conversationClip || 'Idle');
          mesh.userData.controller?.update(dt * speed);
          return;
        }
        npc.phase += dt * 0.12 * speed;
        const t = npc.phase;
        const apartment=isApartment(game.home);
        mesh.position.x = data.x + (apartment?0:Math.sin(t)*1.3);
        if(apartment)mesh.position.z=data.z+Math.sin(t)*.35;
        mesh.position.y = apartment?.25:terrainHeight(mesh.position.x, mesh.position.z) + 0.04;
        mesh.rotation.y = apartment?(Math.cos(t)>0?0:Math.PI):(Math.cos(t)>0?Math.PI/2:-Math.PI/2);
        if (mesh.userData.controller) {
          mesh.userData.controller.play('Walk');
          mesh.userData.controller.update(dt * speed * 0.55);
        } else mesh.userData.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(time * 0.005) * 0.22 * (i ? 1 : -1); });
      });
      for (const { mesh } of this.items.values()) mesh.userData.screenPlayback?.update(mode === 'live' ? dt * speed : 0);
      for (const { mesh } of this.items.values()) mesh.userData.computerPlayback?.update(mode === 'live' ? dt * speed : 0);
      this.queue.update();
      this.autonomy.update(dt * speed);
    }
    this.controls.update();
    for (const group of this.house?.userData.wallGroups || []) {
      const { wall, full, low } = group;
      const dx = this.camera.position.x - this.controls.target.x, dz = this.camera.position.z - this.controls.target.z;
      const active = this.activities.current;
      const focus = active && active.stage !== 'approach' ? this.player.position : this.controls.target;
      const inFront = wall.x1 === wall.x2 ? (wall.x1 - focus.x) * dx > 0.01 : (wall.z1 - focus.z) * dz > 0.01;
      const exterior=isApartment(this.state.game.home)&&this.state.apartmentExterior;
      const cut = !this.state.roof && !exterior && this.state.cutaway !== false && inFront;
      full.visible = !cut; low.visible = cut;
    }
    this.renderer.render(this.scene, this.camera);
  }

  project(x, y, z) {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (p.x + 1) * this.width / 2, y: (-p.y + 1) * this.height / 2 };
  }

  diagnostics({ pixels = true } = {}) {
    const gl = this.renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const samples = [];
    for (let i = 1; pixels && i < 7; i++) {
      const pixel = new Uint8Array(4);
      gl.readPixels(Math.floor(width * i / 8), Math.floor(height * (i % 3 + 2) / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      samples.push(Array.from(pixel));
    }
    const furniture = [...this.items].map(([id, { mesh }]) => {
      const dyes = [];
      mesh.traverse(node => {
        if (node.isMesh && node.material?.name.startsWith('Dye_Main_')) dyes.push(node.material.color.getHexString());
      });
      return { id, source: mesh.userData.source || 'procedural', type: mesh.userData.type, dyes };
    });
    const waterSamples = (pixels ? [[-6, 13.3], [7, 14], [18, -2]] : []).map(([x, z]) => {
      const screen = this.project(x, layout.waterHeight, z);
      const pixel = new Uint8Array(4);
      const px = Math.round(screen.x / this.width * width), py = Math.round((1 - screen.y / this.height) * height);
      if (px >= 0 && py >= 0 && px < width && py < height) gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return Array.from(pixel);
    });
    return {
      samples, calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      position: this.player?.position.toArray(), pathLength: this.path.length, mode: this.state?.mode,
      camera: { type: this.camera.type, position: this.camera.position.toArray(), target: this.controls.target.toArray(), polar: this.controls.getPolarAngle(), azimuth: this.controls.getAzimuthalAngle() },
      walls: this.house.userData.wallGroups.map(({ wall, full }) => ({ id: wall.id, full: full.visible })),
      assets: blenderAssetStatus(), furniture,
      residence:isApartment(this.state.game.home)?this.apartmentSystem.diagnostics():{style:'coastal'},
      previewSource: this.preview?.userData.source || null,
      environment: { landmarks: this.environmentSystem.assets, waterTime: this.environmentSystem.waterTime(), waterSamples, grass: this.environmentSystem.grass.diagnostics(), ocean:this.environmentSystem.ocean.diagnostics() },
      resident: this.player?.userData.controller?.diagnostics() || null,
      lighting:{time:this.lightState.time,phase:this.lightState.phase,sky:this.scene.background.getHexString(),
        sun:this.sun.intensity,ambient:this.hemi.intensity,lamps:this.lightState.lamps,fixtures:this.homeLighting?.diagnostics()},
      computers:[...this.items].filter(([,v])=>v.mesh.userData.computerPlayback)
        .map(([id,v])=>({id,...v.mesh.userData.computerPlayback.diagnostics()})),
      activity: this.activities.current ? { type: this.activities.current.type, stage: this.activities.current.stage, progress: this.activities.current.progress, recipe: this.activities.current.recipe, targetId: this.activities.current.targetId, seatId: this.activities.current.seatId, npcId: this.activities.current.npcId, seat: this.activities.current.seat, seatTop: this.activities.current.seatTop, pillow: this.activities.current.pillow, floor: this.activities.current.floor,
        bedTime:this.activities.current.bedTime,bedPose:this.activities.current.bedPose,stand:this.activities.current.stand } : null,
      mealVisible: !!this.activities.meal,
      coverVisible: !!this.activities.cover,
      bathroom: this.activities.bathroom?.diagnostics() || null,
      handwashing: this.activities.handwashing?.diagnostics() || null,
      fishing: this.activities.fishing?.diagnostics() || null,
      queue: this.queue.items.map(item=>({id:item.id,kind:item.kind,targetId:item.targetId,label:item.label})),
      autonomy: { enabled: this.state.game.sim.autonomy, blocked: this.autonomy.blocked, cooldown: this.autonomy.cooldown, active: !!this.activities.current?.autonomous },
      postureUp: new THREE.Vector3(0, 1, 0).applyQuaternion(this.player.quaternion).toArray(),
      neighbors: isApartment(this.state.game.home)?[]:this.npcs.map(npc => ({ id: npc.id, name: npc.data.name, position: npc.mesh.position.toArray(), rotation: npc.mesh.rotation.y, busy: npc.busy, clip: npc.mesh.userData.controller?.name })),
      televisions: [...this.items].filter(([, item]) => item.mesh.userData.screenPlayback).map(([id, item]) => {
        const screen = item.mesh.getObjectByName('TVScreen');
        const screenPixels = (pixels ? [-0.35, 0, 0.35] : []).map(x => {
          const point = screen.localToWorld(new THREE.Vector3(x, 0.23, 0));
          const p = this.project(point.x, point.y, point.z);
          const color = new Uint8Array(4);
          const px = Math.round(p.x / this.width * width), py = Math.round((1 - p.y / this.height) * height);
          if (px >= 0 && py >= 0 && px < width && py < height) gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color);
          return [...color];
        });
        return { id, ...item.mesh.userData.screenPlayback.diagnostics(), screenPixels };
      }),
      windows: this.house.userData.wallGroups.flatMap(({ full }) => full.children.filter(node => node.name === 'HouseWindow')).map(node => ({
        ...node.userData.window, glass: new THREE.Box3().setFromObject(node.getObjectByName('WindowGlass')).getCenter(new THREE.Vector3()).toArray(),
      })),
    };
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  removePreview() {
    if (this.preview) { this.worldRoot.remove(this.preview); disposeModel(this.preview); this.preview = null; }
    this.hoverOutline.visible = false;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown, true);
    canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp);
    canvas.removeEventListener('pointerleave', this.pointerLeave);
    canvas.removeEventListener('pointercancel', this.pointerCancel);
    canvas.removeEventListener('contextmenu', this.contextMenu);
    this.activities.cancel(true, undefined, true);
    this.queue.clear();
    this.removePreview();
    this.player?.userData.controller?.dispose();
    this.studioAvatar?.userData.controller?.dispose();
    this.npcs.forEach(({ mesh }) => mesh.userData.controller?.dispose());
    disposeModel(this.environment);
    if(this.apartmentSystem){disposeModel(this.apartmentSystem.root);this.apartmentSystem.dispose();}
    this.environmentSystem.ocean.dispose();
    disposeModel(this.furnitureRoot);
    if(this.homeLighting)disposeModel(this.homeLighting.root);
    this.scene.traverse(object => { if (object.userData.disposable) object.geometry?.dispose(); });
    for (const object of [this.grid, this.apartmentGrid, this.selection, this.hoverOutline, this.destination].filter(Boolean)) {
      object.geometry.dispose(); object.material.dispose();
    }
    this.renderer.dispose();
    canvas.remove();
  }
}

import * as THREE from 'three';

export class QualityMaterials {
  constructor() {
    this.meshes = new WeakMap();
    this.materials = new WeakMap();
    this.owned = new Set();
  }

  simplify(original) {
    if (!original?.isMeshStandardMaterial) return original;
    if (this.materials.has(original)) return this.materials.get(original);
    const simple = new THREE.MeshLambertMaterial({
      map: original.map, alphaMap: original.alphaMap, emissiveMap: original.emissiveMap,
      transparent: original.transparent, opacity: original.opacity, alphaTest: original.alphaTest,
      side: original.side, depthWrite: original.depthWrite, depthTest: original.depthTest,
      vertexColors: original.vertexColors, toneMapped: original.toneMapped,
    });
    simple.name = original.name;
    simple.color = original.color;
    simple.emissive = original.emissive;
    simple.userData = original.userData;
    for (const key of ['emissiveIntensity', 'opacity', 'visible']) {
      Object.defineProperty(simple, key, {
        configurable: true, enumerable: true,
        get: () => original[key],
        set: value => { original[key] = value; },
      });
    }
    this.materials.set(original, simple);
    this.owned.add(simple);
    return simple;
  }

  update(root, low, includeHidden = false) {
    const visit = node => {
      if (!node.isMesh) return;
      let pair = this.meshes.get(node);
      if (!low) {
        if (pair && node.material === pair.simple) node.material = pair.original;
        return;
      }
      if (!pair || node.material !== pair.original && node.material !== pair.simple) {
        const original = node.material;
        pair = {original, simple: Array.isArray(original) ? original.map(m => this.simplify(m)) : this.simplify(original)};
        this.meshes.set(node, pair);
      }
      node.material = low ? pair.simple : pair.original;
      if (low) {
        const sources = Array.isArray(pair.original) ? pair.original : [pair.original];
        const targets = Array.isArray(pair.simple) ? pair.simple : [pair.simple];
        sources.forEach((source, i) => {
          if (source.isMeshStandardMaterial) {
            targets[i].emissiveIntensity = source.emissiveIntensity;
            targets[i].opacity = source.opacity;
            targets[i].visible = source.visible;
          }
        });
      }
    };
    if (includeHidden) root.traverse(visit);
    else root.traverseVisible(visit);
  }

  dispose(root) {
    this.update(root, false, true);
    this.owned.forEach(material => material.dispose());
    this.owned.clear();
  }
}

"""Bind the user-supplied static character without publishing its source assets."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector


def smooth(a, b, x):
    t = min(1, max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    options = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    root = Path(__file__).resolve().parents[2]
    bpy.ops.wm.open_mainfile(filepath=str(root / "art/blender/sunny-resident.blend"))
    rig = bpy.data.objects["SunnyResident"]
    for obj in list(rig.children):
        if obj.get("base") != "female":
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(options.source))
    added = set(bpy.data.objects) - before
    source = max((obj for obj in added if obj.type == "MESH"), key=lambda obj: len(obj.data.vertices))
    mesh = source.data
    mesh.transform(source.matrix_world)
    source.parent = None
    source.matrix_world = Matrix.Identity(4)
    image = next(n.image for m in mesh.materials for n in m.node_tree.nodes if n.type == "TEX_IMAGE")
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)
    clean_image = bpy.data.images.new("SuppliedResident_Albedo", width, height, alpha=True)
    clean_image.pixels.foreach_set(pixels.reshape(-1))
    clean_image.update()
    options.output.mkdir(parents=True, exist_ok=True)
    clean_image.filepath_raw = str(options.output.resolve() / "resident-albedo.png")
    clean_image.file_format = "PNG"
    clean_image.save()
    image = clean_image
    uv = mesh.uv_layers.active.data

    def role_for(poly):
        center = sum((mesh.vertices[i].co for i in poly.vertices), Vector()) / len(poly.vertices)
        u, v = sum((uv[i].uv for i in poly.loop_indices), Vector((0, 0))) / len(poly.loop_indices)
        rgb = pixels[min(height-1, int(v*height)), min(width-1, int(u*width)), :3]
        if v < .25 and u < .515 and center.z > 1.35:
            return "Hair"
        if .251 < v < .302 and u < .105 and center.z > 1.7:
            return "Eyes"
        if center.z < .19 and v > .9:
            return "Shoes"
        if center.z < 1.09 and abs(center.x) < .24:
            return "Trousers"
        if rgb[0] > rgb[1] * 1.13 and rgb[0] > rgb[2] * 1.2:
            return "Skin"
        if .50 < v < .695 and u < .51 or .50 < v < .588 and u > .51:
            return "Top"
        if v < .25:
            return "Jewelry" if center.z > 1.4 else "Skin"
        return "Skin" if center.z > 1.61 or abs(center.x) > .37 else "Top"

    buckets = {}
    for poly in mesh.polygons:
        buckets.setdefault(role_for(poly), []).append(poly)
    z_source = [0, .10, .55, .98, 1.12, 1.42, 1.56, 1.62, 1.745, 1.883]
    z_target = [0, .09, .58, 1.08, 1.22, 1.53, 1.69, 1.77, 1.90, 2.10]

    def trunk(p, role):
        q = Vector((p.x * 1.15, p.y * 1.05, float(np.interp(p.z, z_source, z_target))))
        q.y -= .052 * smooth(1.49, 1.68, p.z)
        if role == "Hair":
            return q, {"Head": 1}
        if role == "Eyes":
            return q, {"Eye_L" if p.x < 0 else "Eye_R": 1}
        if p.z > 1.63:
            nose = smooth(.09, .116, -p.y) * (1-smooth(.016, .03, abs(p.x)))
            nose *= smooth(1.69, 1.72, p.z) * (1-smooth(1.747, 1.767, p.z))
            return q, {"Head": 1-nose*.6, "Nose": nose*.6}
        if p.z > 1.53:
            w = smooth(1.53, 1.64, p.z)
            return q, {"Neck": 1-w, "Head": w}
        if p.z >= 1.08:
            a = smooth(1.08, 1.21, p.z)
            b = smooth(1.23, 1.47, p.z)
            return q, {"Hips": 1-a, "Spine": a*(1-b), "Chest": a*b}
        side = "L" if p.x < 0 else "R"
        hip = smooth(.94, 1.09, p.z)
        knee = smooth(.49, .61, p.z)
        foot = 1-smooth(.10, .19, p.z)
        if role == "Shoes":
            return q, {f"Foot_{side}": 1}
        return q, {"Hips": hip, f"Thigh_{side}": (1-hip)*knee,
                   f"Shin_{side}": (1-hip)*(1-knee)*(1-foot), f"Foot_{side}": (1-hip)*(1-knee)*foot}

    def fitted(p, role):
        q, weights = trunk(p, role)
        if role in {"Hair", "Eyes", "Trousers", "Shoes"} or p.z < .92 or p.z > 1.60:
            return q, weights
        side, sign = ("L", -1) if p.x < 0 else ("R", 1)
        shoulder = Vector((sign*.175, .015, 1.51))
        elbow = Vector((sign*.414, .005, 1.285))
        wrist = Vector((sign*.609, -.004, 1.07))
        tip = Vector((sign*.702, -.004, .972))
        # Blend the continuous shoulder into the torso; no detached sleeve caps.
        threshold = float(np.interp(p.z, [1.05, 1.28, 1.42, 1.55], [.50, .30, .16, .12]))
        arm = smooth(threshold, threshold+.08, abs(p.x)) * (1-smooth(1.53, 1.61, p.z))
        fore = smooth(.375, .451, abs(p.x))
        hand = smooth(.580, .636, abs(p.x))
        influences = [(f"UpperArm_{side}", shoulder, elbow, 1-fore),
                      (f"Forearm_{side}", elbow, wrist, fore*(1-hand)),
                      (f"Hand_{side}", wrist, tip, fore*hand)]
        result = Vector()
        bound = {}
        for name, a, b, weight in influences:
            bone = rig.data.bones[name]
            c, d = bone.head_local, bone.tail_local
            axis = (b-a).normalized()
            rotation = axis.rotation_difference((d-c).normalized())
            local = p-a
            scale = .88 if name.startswith("Hand") else 1.02
            along = (d-c).length/(b-a).length
            result += (c + rotation @ (local*scale + axis*local.dot(axis)*(along-scale))) * weight
            bound[name] = weight
        merged = {name: weight*(1-arm) for name, weight in weights.items()}
        for name, weight in bound.items():
            merged[name] = merged.get(name, 0) + weight*arm
        return q.lerp(result, arm), merged

    materials = {}
    for role in buckets:
        material = bpy.data.materials.new(f"Resident_Supplied_{role}")
        material.use_nodes = True
        material["surface_role"] = role
        material["supplied_character"] = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        shader = nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value = {
            "Skin": .58, "Hair": .48, "Eyes": .23, "Top": .88,
            "Trousers": .94, "Shoes": .5, "Jewelry": .28,
        }[role]
        shader.inputs["Metallic"].default_value = .35 if role == "Jewelry" else 0
        shader.inputs["Specular IOR Level"].default_value = .27
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        if role in {"Skin", "Hair", "Top", "Trousers", "Shoes"}:
            samples = []
            for poly in buckets[role]:
                u, v = sum((uv[i].uv for i in poly.loop_indices), Vector((0, 0))) / len(poly.loop_indices)
                samples.append(pixels[min(height-1, int(v*height)), min(width-1, int(u*width)), :3])
            reference = np.maximum(np.percentile(np.asarray(samples), 75, axis=0), .025)
            normalized = pixels.copy()
            if role == "Skin":
                normalized[:, :, :3] = np.clip(normalized[:, :, :3]/reference*.84, 0, 1)
            else:
                grey = normalized[:, :, :3] @ np.array([.2126, .7152, .0722])
                level = max(.025, float(reference @ np.array([.2126, .7152, .0722])))
                normalized[:, :, :3] = np.clip(grey[:, :, None]/level*.78, 0, 1)
            texture = bpy.data.images.new(f"Supplied_{role}_Detail", width, height, alpha=True)
            texture.pixels.foreach_set(normalized.reshape(-1))
            texture.update()
            texture.scale(512, 1024)
            texture.filepath_raw = str(options.output.resolve() / f"{role.lower()}-detail.png")
            texture.file_format = "PNG"
            texture.save()
            texture.pack()
            tex.image = texture
            material["normalized_tint"] = True
        links.new(tex.outputs["Color"], shader.inputs["Base Color"])
        materials[role] = material
    image.pack()
    counts = {}
    for role, polygons in buckets.items():
        variants = (["shirt", "jacket", "cardigan"] if role == "Top" else
                    ["hair:bob", "hair:short", "hair:bun", "hair:curly"] if role == "Hair" else [None])
        for variant in variants:
            indices = sorted({i for poly in polygons for i in poly.vertices})
            lookup = {old: new for new, old in enumerate(indices)}
            points, bindings = [], []
            for i in indices:
                point, weights = fitted(mesh.vertices[i].co, role)
                if variant == "cardigan" and point.z < 1.5:
                    point.x *= 1.025
                    point.y *= 1.035
                if role == "Hair":
                    if variant == "hair:short" and point.z < 1.96:
                        point.z = 1.96+(point.z-1.96)*.34
                    if variant == "hair:bun":
                        t = 1-smooth(1.77, 1.97, point.z)
                        point.x *= 1-.72*t
                        point.y = point.y*(1-t)+(.18+.02*math.sin(point.z*20))*t
                        point.z = point.z*(1-t)+(1.94+(point.z-1.74)*.28)*t
                    if variant == "hair:curly" and point.z < 1.97:
                        t = 1-smooth(1.82, 1.97, point.z)
                        point.x += math.sin(point.z*52+point.y*9)*.014*t
                        point.y += math.cos(point.z*45+point.x*9)*.011*t
                points.append(point)
                bindings.append(weights)
            target = bpy.data.meshes.new(f"Supplied_{role}_{variant or 'base'}")
            target.from_pydata(points, [], [tuple(lookup[i] for i in p.vertices) for p in polygons])
            target.materials.append(materials[role])
            target.update()
            target_uv = target.uv_layers.new(name="UVMap")
            for dst, src in zip(target.polygons, polygons):
                dst.use_smooth = True
                for a, b in zip(dst.loop_indices, src.loop_indices):
                    target_uv.data[a].uv = uv[b].uv
            obj = bpy.data.objects.new(target.name, target)
            bpy.context.scene.collection.objects.link(obj)
            obj.parent = rig
            obj["base"] = "female"
            obj["role"] = role
            obj["source_model"] = "User supplied Mrs_Afton"
            obj["local_only"] = True
            if variant:
                obj["variant"] = variant
            for i, weights in enumerate(bindings):
                filtered = dict(sorted(((name, w) for name, w in weights.items() if w > .001),
                                       key=lambda entry: -entry[1])[:4])
                total = sum(filtered.values())
                for name, weight in filtered.items():
                    group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
                    group.add([i], weight/total, "REPLACE")
            modifier = obj.modifiers.new("Resident skeleton", "ARMATURE")
            modifier.object = rig
            counts[role] = len(polygons)
    for obj in added:
        bpy.data.objects.remove(obj, do_unlink=True)
    # Keep the source shoe silhouette in bed, but replace the leather finish.
    shoes = next(obj for obj in rig.children if obj.get("base") == "female" and obj.get("role") == "Shoes")
    socks = shoes.copy()
    socks.data = shoes.data.copy()
    socks.name = "Supplied_SleepSocks"
    socks["role"] = "Undershirt"
    socks["accessory"] = "sleep-socks"
    sock_material = bpy.data.materials.new("Resident_Undershirt")
    sock_material.diffuse_color = (.82, .85, .81, 1)
    sock_material.use_nodes = True
    sock_material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (.82, .85, .81, 1)
    socks.data.materials.clear()
    socks.data.materials.append(sock_material)
    bpy.context.scene.collection.objects.link(socks)
    bpy.context.scene.frame_set(1)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in rig.children:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    options.output.mkdir(parents=True, exist_ok=True)
    destination = options.output / "resident.glb"
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", use_selection=True,
        export_yup=True, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_extras=True, export_cameras=False, export_lights=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(options.output / "resident.blend"), compress=True)
    content = destination.read_bytes()
    manifest = json.loads((root / "src/assets/resident-manifest.json").read_text())
    manifest.update(file="__local-resident/resident.glb", bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(), artist="User-supplied Mrs_Afton / local adaptation",
        source=str(options.source), localOnly=True, parts=counts,
        sourceUrl="https://sketchfab.com/3d-models/mrs-afton-4d7ab5b85b7947d3bf7eaf398461960e",
        adaptation="Static supplied mesh rebound to 29-bone interaction rig; normalized recolorable texture details")
    for key in ["compressedFile", "compressedBytes", "compressedSha256"]:
        manifest.pop(key, None)
    (options.output / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    print("REFINED_RESIDENT", json.dumps(counts))


if __name__ == "__main__":
    main()

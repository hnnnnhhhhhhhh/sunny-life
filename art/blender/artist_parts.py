"""Adapt Quaternius CC0 head, eye and hair meshes to the resident skeleton."""
import bpy
import bmesh
import numpy as np
import json
from pathlib import Path
from mathutils import Matrix, Vector

LAYOUT = json.loads((Path(__file__).resolve().parents[2] / "src/resident-layout.json").read_text())
HEAD_SHIFT = LAYOUT["headShift"]
HEAD_FORWARD = LAYOUT["headForward"]
NECK_CUT = 1.765 + HEAD_SHIFT


def image_material(name, image, reference="#ffffff"):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 0.8
    shader.inputs["Specular IOR Level"].default_value = 0.25
    material["tint_reference"] = reference
    if image:
        if image.size[0] > 512:
            image.scale(512, 512)
        image.pack()
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = image
        material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return material


def base_image(obj):
    for material in obj.data.materials:
        if not material or not material.use_nodes:
            continue
        candidates = [node.image for node in material.node_tree.nodes if node.type == "TEX_IMAGE" and node.image]
        preferred = [image for image in candidates if "BaseColor" in image.name or "Eye_Brown" in image.name]
        if preferred:
            return preferred[0]
        if candidates:
            return candidates[0]
    return None


def normalized_image(image, name, mesh=None, eye_z=0):
    if image.size[0] > 512:
        image.scale(512, 512)
    w, h = image.size
    pixels = np.empty(w*h*4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape((h, w, 4))
    if mesh is not None:
        samples = []
        uv = mesh.uv_layers.active.data
        for loop in mesh.loops:
            p = mesh.vertices[loop.vertex_index].co
            if eye_z-0.085 < p.z < eye_z-0.025 and 0.02 < abs(p.x) < 0.065 and p.y < -0.035:
                u, v = uv[loop.index].uv
                samples.append(pixels[min(h-1,int(v*h)),min(w-1,int(u*w)),:3])
        reference = np.maximum(np.median(np.asarray(samples),axis=0),0.03) if samples else np.array([0.6,0.4,0.25])
        pixels[:,:,:3] = np.clip(pixels[:,:,:3]/reference,0,1)
    else:
        grey = pixels[:,:,:3].mean(axis=2)
        valid = grey[grey > 0.025]
        reference = max(0.03,float(np.percentile(valid,90))) if len(valid) else 1
        pixels[:,:,:3] = np.clip(grey[:,:,None]/reference,0,1)
    result = bpy.data.images.new(name,w,h,alpha=True)
    result.pixels.foreach_set(pixels.reshape(-1))
    result.update()
    return result


def world_mesh(obj):
    matrix = obj.matrix_world.copy()
    obj.parent = None
    obj.modifiers.clear()
    obj.data.transform(matrix)
    obj.matrix_world = Matrix.Identity(4)
    obj.vertex_groups.clear()


def transform(obj, scale, offset):
    for vertex in obj.data.vertices:
        vertex.co *= scale
        vertex.co += offset
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def skin_weights(p):
    x, y, z = p.x, p.z, -p.y
    if y < LAYOUT["headBase"]:
        amount = max(0, min(1, (y - 1.62) / 0.135))
        return {"Chest": 1 - amount, "Neck": amount}
    if abs(x) < 0.03 and 1.925 + HEAD_SHIFT < y < 1.98 + HEAD_SHIFT and z > 0.15 + HEAD_FORWARD:
        return {"Head": 0.45, "Nose": 0.55}
    if y < 1.94 + HEAD_SHIFT and z > 0.08 + HEAD_FORWARD:
        return {"Head": 0.7, "Jaw": 0.3}
    return {"Head": 1}

def connect_neck(obj, material):
    # Retain the chin in front while reshaping the source character's trapezius
    # into the narrower neck of this rig before bridging the shared cut ring.
    for vertex in obj.data.vertices:
        p = vertex.co
        upper = 1.940 + HEAD_SHIFT
        if p.z >= upper or p.y < -0.075 - HEAD_FORWARD:
            continue
        t = max(0, min(1, (upper - p.z) / (upper - NECK_CUT)))
        weight = t * t * (3 - 2 * t)
        radial = Vector((p.x / 0.060, (p.y + 0.012) / 0.048))
        if radial.length > 1:
            radial.normalize()
            p.x = p.x * (1 - weight) + radial.x * 0.060 * weight
            p.y = p.y * (1 - weight) + (-0.012 + radial.y * 0.048) * weight
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
    rim = [edge for edge in bm.edges if edge.is_boundary and all(abs(v.co.z - NECK_CUT) < 0.0001 for v in edge.verts)]
    if not rim:
        raise RuntimeError("Head neck cut has no boundary ring")
    vertices = set(v for edge in rim for v in edge.verts)
    center = sum((v.co for v in vertices), Vector()) / len(vertices)
    edges = [(edge.verts[0], edge.verts[1]) for edge in rim]
    uv = bm.loops.layers.uv.active
    for height, rx, ry, cy in [(1.700, 0.059, 0.048, -0.008), (1.67, 0.077, 0.058, 0), (1.61, 0.10, 0.065, 0)]:
        next_ring = {}
        for vertex in vertices:
            radial = Vector((vertex.co.x - center.x, vertex.co.y - center.y))
            radial.normalize()
            next_ring[vertex] = bm.verts.new((radial.x * rx, cy + radial.y * ry, height))
        for a, b in edges:
            face = bm.faces.new((a, b, next_ring[b], next_ring[a]))
            face.material_index = len(obj.data.materials)
            face.smooth = True
            if uv:
                for loop in face.loops:
                    loop[uv].uv = (0, 0)
        edges = [(next_ring[a], next_ring[b]) for a, b in edges]
        vertices = set(next_ring.values())
        center = Vector((0, cy, height))
    cap = bmesh.ops.holes_fill(bm, edges=[edge for edge in bm.edges if edge.is_boundary and all(v.co.z < 1.62 for v in edge.verts)])
    for face in cap["faces"]:
        face.material_index = len(obj.data.materials)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    obj["neck_bridge_edges"] = len(rim)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(material)


def attach(project, register, skin_material):
    vendor = project / "art/vendor/quaternius"
    calibrations = {}
    for base, source_name in [("female", "Superhero_Female"), ("male", "Superhero_Male")]:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(vendor / "base" / f"{source_name}_FullBody.gltf"))
        added = set(bpy.data.objects) - before
        meshes = [obj for obj in added if obj.type == "MESH"]
        body = max(meshes, key=lambda obj: len(obj.data.vertices))
        eyes = next(obj for obj in meshes if any("Eye" in material.name for material in obj.data.materials))
        brows = max((obj for obj in meshes if obj not in {body, eyes}), key=lambda obj: len(obj.data.vertices))
        eye_image = base_image(eyes)
        brow_image = base_image(brows)
        for obj in [body, eyes, brows]:
            world_mesh(obj)
        eye_z = sum((eyes.data.vertices[i].co.z for i in range(len(eyes.data.vertices)))) / len(eyes.data.vertices)
        head_top = max(v.co.z for v in body.data.vertices)
        scale = 0.175 / (head_top - eye_z)
        offset = Vector((0, -0.026 - HEAD_FORWARD, LAYOUT["eyeHeight"] - eye_z * scale))
        calibrations[base] = (scale, offset)
        bm = bmesh.new()
        bm.from_mesh(body.data)
        cutoff = (NECK_CUT - offset.z) / scale
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                              plane_co=(0, 0, cutoff), plane_no=(0, 0, 1), clear_inner=True)
        bm.to_mesh(body.data)
        bm.free()
        light_file = vendor / ("T_Superhero_Female_Light_BaseColor.png" if base == "female" else "T_Superhero_Male_Ligh.png")
        face_image = bpy.data.images.load(str(light_file), check_existing=True)
        face_image = normalized_image(face_image, f"Resident_skin_{base}", body.data, eye_z)
        brow_image = normalized_image(brow_image, f"Resident_brows_{base}")
        for obj, role, image, bind, ref in [
            (body, "ArtSkin", face_image, skin_weights, "#ffffff"),
            (eyes, "ArtEyes", eye_image, lambda p: {"Eye_L" if p.x < 0 else "Eye_R": 1}, "#ffffff"),
            (brows, "ArtBrows", brow_image, "Head", "#ffffff"),
        ]:
            transform(obj, scale, offset)
            obj.data.materials.clear()
            obj.data.materials.append(image_material(f"Resident_{role}_{base}", image, ref))
            if obj == body:
                connect_neck(obj, skin_material)
            obj["base"] = base
            register(obj, role, bind)
        for obj in added - {body, eyes, brows}:
            bpy.data.objects.remove(obj, do_unlink=True)
    for base in ["female", "male"]:
        for variant, file in [("bob", "Hair_Long"), ("bun", "Hair_Buns"), ("short", "Hair_SimpleParted"), ("curly", "Hair_Long")]:
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(vendor / "hair" / f"{file}.gltf"))
            added = set(bpy.data.objects) - before
            meshes = [obj for obj in added if obj.type == "MESH" and obj.data.vertices]
            for obj in meshes:
                image = normalized_image(base_image(obj), f"Resident_hair_{base}_{variant}")
                world_mesh(obj)
                canonical = "male" if variant == "short" else "female"
                scale, offset = calibrations[canonical]
                transform(obj, scale, offset)
                if base == "male":
                    for vertex in obj.data.vertices:
                        vertex.co.x *= 1.08
                if variant == "curly":
                    import math
                    for vertex in obj.data.vertices:
                        if vertex.co.z < 2.0:
                            vertex.co.x += math.sin(vertex.co.z * 42) * 0.008
                obj.data.materials.clear()
                obj.data.materials.append(image_material(f"Resident_ArtHair_{base}_{variant}", image, "#ffffff"))
                obj["base"] = base
                register(obj, "ArtHair", "Head", f"hair:{variant}")
            for obj in added - set(meshes):
                bpy.data.objects.remove(obj, do_unlink=True)

"""Adapt the supplied CC assets without changing the game's interaction anchors."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_furniture as b

PROJECT = Path(__file__).resolve().parents[2]
POOLS, ROOTS, MATERIALS = {}, {}, {}
FOOTPRINTS = {"kitchen": (3.9, .95), "fridge": (.9, .85), "sink": (1.1, .8),
              "toilet": (.8, 1.15), "plumbob": (.2, .2)}


def base_image(material):
    if not material or not material.use_nodes:
        return None
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        for link in shader.inputs["Base Color"].links:
            if link.from_node.type == "TEX_IMAGE":
                return link.from_node.image
    return None


def surface(source, role, color="#ffffff", roughness=.6, metal=0, neutral=False):
    key = (source.name if source else "", role, color, roughness, metal, neutral)
    if key in MATERIALS:
        return MATERIALS[key]
    mat = b.mat(role, color, roughness, metal)
    image = base_image(source)
    if image:
        image = image.copy()
        image.name = f"{role}_Albedo"
        width, height = image.size
        scale = min(1, 512 / max(width, height))
        image.scale(max(1, round(width * scale)), max(1, round(height * scale)))
        if neutral:
            pixels = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
            image.pixels.foreach_get(pixels)
            pixels = pixels.reshape((-1, 4))
            grey = pixels[:, :3] @ np.array([.2126, .7152, .0722])
            pixels[:, :3] = np.clip(.52 + np.power(grey, .32)[:, None] * .48, 0, 1)
            image.pixels.foreach_set(pixels.reshape(-1))
            image.update()
        image.pack()
        texture = mat.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = image
        shader = mat.node_tree.nodes.get("Principled BSDF")
        mat.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
        if source.surface_render_method == "DITHERED" and "Glass" in source.name:
            mat.node_tree.links.new(texture.outputs["Alpha"], shader.inputs["Alpha"])
            mat.surface_render_method = "DITHERED"
    MATERIALS[key] = mat
    return mat


def source_mesh(pool, name):
    obj = POOLS[pool][name]
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
    mesh.transform(obj.matrix_world)
    return mesh


def polish(mesh):
    if mesh.has_custom_normals:
        mesh.normals_split_custom_set([(0, 0, 0)] * len(mesh.loops))
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(48))


def attach(mesh, name, source_id):
    obj = bpy.data.objects.new(name, mesh)
    b.CURRENT.objects.link(obj)
    obj.parent = b.ROOT
    obj["sourceAsset"] = source_id
    polish(mesh)
    if source_id != "plumbob":
        normal = obj.modifiers.new("Weighted manufactured normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
        normal.weight = 50
    return obj


def bounds(meshes):
    points = [v.co for mesh in meshes for v in mesh.vertices]
    return [Vector(tuple(f(p[i] for p in points) for i in range(3))) for f in [min, max]]


def fit(meshes, center, size):
    low, high = bounds(meshes)
    origin = (low + high) / 2
    origin.z = low.z
    scale = Vector((size[0] / (high.x - low.x), size[2] / (high.y - low.y), size[1] / (high.z - low.z)))
    for mesh in meshes:
        for vertex in mesh.vertices:
            p = vertex.co - origin
            vertex.co = Vector((p.x * scale.x, p.y * scale.y, p.z * scale.z)) + b.point(*center)
        mesh.update()


def appliance(names, center, size, label, dye=False):
    meshes = [source_mesh("kitchen", name) for name in names]
    fit(meshes, center, size)
    result = []
    for i, mesh in enumerate(meshes):
        old = list(mesh.materials)
        mesh.materials.clear()
        for source in old:
            role = f"Dye_Main_{label}" if dye and source.name == "Fridge_Body" else f"Supplied_{source.name}"
            mat = surface(source, role, roughness=.38 if "Body" in source.name else .48,
                          metal=.28 if "Body" in source.name else .08, neutral=role.startswith("Dye_"))
            mesh.materials.append(mat)
        result.append(attach(mesh, f"{label}_{i}", "kitchen"))
    return result


def faucet(center):
    metal = b.mat("Brushed_nickel", "#adc2c4", .25, .75)
    ceramic = b.mat("Soap_ivory", "#edf2ed", .34)
    # Source basin stays intact; the outlet and controls match existing hand IK.
    curve = bpy.data.curves.new("Curved faucet", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = .022
    curve.bevel_resolution = 2
    curve.resolution_u = 8
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(3)
    for point, position in zip(spline.bezier_points, [(center, 1.02, -.32), (center, 1.39, -.30),
                                                    (center, 1.44, -.07), (center, 1.32, .07)]):
        point.co = b.point(*position)
        point.handle_left_type = point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new("Faucet", curve)
    b.CURRENT.objects.link(obj)
    obj.parent = b.ROOT
    curve.materials.append(metal)
    obj["part"] = "Faucet"
    handle = b.rounded("TapHandle", (center + .44, 1.12, .22), (.025, .085, .075), metal, .01, 2)
    handle["part"] = "TapHandle"
    b.lathe("Tap base", (center + .44, 1.015, .22), [(.035, 0), (.035, .06), (0, .06)], metal, 12)
    b.lathe("Soap bottle", (center - .45, 1.015, .22), [(.055, 0), (.06, .02), (.052, .18), (.024, .20)],
            b.mat("Sea_glass_soap", "#81ada5", .35), 12)
    pump = b.rounded("SoapPump", (center - .45, 1.23, .22), (.075, .035, .095), ceramic, .01, 2)
    pump["part"] = "SoapPump"


def sink(center=0, width=1.08, depth=.78):
    mesh = source_mesh("kitchen", "Sink_0")
    source = mesh.materials[0]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    remaining, remove = set(bm.verts), []
    while remaining:
        vertex = remaining.pop()
        component, pending = {vertex}, [vertex]
        while pending:
            for edge in pending.pop().link_edges:
                for vertex in edge.verts:
                    if vertex in remaining:
                        remaining.remove(vertex)
                        component.add(vertex)
                        pending.append(vertex)
        if min(v.co.z for v in component) >= .995:
            remove.extend(component)
    bmesh.ops.delete(bm, geom=remove, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    fit([mesh], (center, 0, 0), (width, 1, depth))
    mesh.materials.clear()
    mesh.materials.append(surface(source, "Dye_Main_cabinet", neutral=True, roughness=.66))
    mesh.materials.append(b.mat("Pale_stone", "#e2e7e4", .4))
    mesh.materials.append(b.mat("Sink_ceramic", "#edf2ef", .23))
    mesh.materials.append(b.mat("Cabinet_handles", "#afc2c0", .28, .7))
    for polygon in mesh.polygons:
        p = polygon.center
        polygon.material_index = 0 if p.z < .81 else 1 if p.z > .987 else 2
        if p.y < -depth * .46 and .48 < p.z < .67 and abs(p.x - center) < .08:
            polygon.material_index = 3
    obj = attach(mesh, "ImportedSink", "kitchen")
    for polygon in mesh.polygons:
        if polygon.material_index == 0:
            polygon.use_smooth = False
    obj["part"] = "SinkBasin"
    faucet(center)


def build_kitchen():
    sink(-1.13, 1.64, .94)
    appliance(["Stove_0", "Stove Alpha_0", "Stove Holes_0"], (.21, 0, 0), (.94, 1.18, .92), "Range")
    meshes = [source_mesh("kitchen", name) for name in ["Counter Body.010_0", "Countertop.009_0"]]
    fit(meshes, (1.315, 0, 0), (1.25, 1, .94))
    for i, mesh in enumerate(meshes):
        source = mesh.materials[0]
        mesh.materials.clear()
        mesh.materials.append(surface(source, "Dye_Main_prep", neutral=True) if i == 0 else b.mat("Pale_stone", "#e2e7e4", .4))
        attach(mesh, f"PrepCounter_{i}", "kitchen")
    appliance(["Microwave.001_0", "Microwave Glass_0"], (1.315, 1.005, -.08), (.83, .405, .52), "Microwave")
    b.rounded("Cabinet filler", (-.285, .5, 0), (.05, 1, .90), b.mat("Dye_Main_filler", "#ffffff", .65), .003, 1)
    b.rounded("Stone upstand", (0, 1.07, -.451), (3.88, .14, .025), b.mat("Pale_stone", "#e2e7e4", .4), .004, 2)


def build_toilet():
    source_names = [name for name, obj in POOLS["toilet"].items() if obj.type == "MESH" and obj.data.polygons]
    scale = .59 / (.4665432831219504 - .0021222168799737)
    for name in source_names:
        mesh = source_mesh("toilet", name)
        for v in mesh.vertices:
            v.co = Vector(((v.co.x + .00128665) * scale,
                           (v.co.y + .29074471) * scale - .12,
                           (v.co.z - .0021222168799737) * scale))
        mesh.materials.clear()
        mesh.materials.append(b.mat("Dye_Main_toilet", "#ffffff", .24) if name == "Object_5"
                              else b.mat("Toilet_chrome", "#afbec1", .23, .75))
        for face in mesh.polygons:
            face.material_index = 0
        obj = attach(mesh, name, "toilet")
        bevel = obj.modifiers.new("Soft ceramic edges", "BEVEL")
        bevel.width = .003
        bevel.segments = 2
        bevel.limit_method = "ANGLE"
        if name == "Object_3":
            low, high = bounds([mesh])
            center = (low + high) / 2
            mesh.transform(Matrix.Translation(-center))
            obj.location = center
            obj["part"] = "FlushHandle"
        if name == "Object_5":
            obj["part"] = "ToiletBody"
    water = b.lathe("ToiletWater", (0, 0, 0), [(0, 0), (.13, 0), (.13, .008), (0, .008)],
                    b.mat("Toilet_water", "#a6d2d2", .19, .08), 24)
    water.location = b.point(0, .525, .12)
    water.scale.y = 1.28
    water["part"] = "ToiletWater"


def build_plumbob():
    source = next(obj for obj in POOLS["plumbob"].values() if obj.type == "MESH")
    mesh = source_mesh("plumbob", source.name)
    low, high = bounds([mesh])
    center = (low + high) / 2
    scale = .34 / (high.z - low.z)
    for vertex in mesh.vertices:
        vertex.co = (vertex.co - center) * scale
    mesh.materials.clear()
    mesh.materials.append(b.mat("Jade_crystal", "#6ed18e", .23, .2))
    obj = attach(mesh, "ResidentCrystal", "plumbob")
    for face in mesh.polygons:
        face.use_smooth = False
    obj["part"] = "ResidentCrystal"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export-only", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if not args.export_only:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        for kind in ["kitchen", "toilet", "plumbob"]:
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=str(PROJECT / ".runtime/supplied-input" / f"{kind}.glb"))
            POOLS[kind] = {obj.name: obj for obj in set(bpy.data.objects) - before}
            for obj in POOLS[kind].values():
                if obj.type == "ARMATURE":
                    for bone in obj.pose.bones:
                        if "door" in bone.name.lower():
                            bone.rotation_quaternion = (1, 0, 0, 0)
        builders = {"kitchen": build_kitchen, "sink": sink, "fridge": lambda: appliance(
            ["Fridge.001_0", "Fridge Screen_0", "Fridge Screen Display_0"], (0, 0, 0), (.88, 2.08, .83), "fridge", True),
            "toilet": build_toilet, "plumbob": build_plumbob}
        for kind, build in builders.items():
            b.CURRENT = bpy.data.collections.new(f"Supplied_{kind}")
            bpy.context.scene.collection.children.link(b.CURRENT)
            b.ROOT = bpy.data.objects.new(f"Supplied_{kind}", None)
            b.CURRENT.objects.link(b.ROOT)
            b.ROOT["assetType"] = kind
            b.ROOT["license"] = "CC-BY-SA-4.0"
            ROOTS[kind] = b.ROOT
            build()
        for obj in set(obj for pool in POOLS.values() for obj in pool.values()):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.orphans_purge(do_recursive=True)
        bpy.context.scene.unit_settings.system = "METRIC"
    else:
        ROOTS.update({kind: bpy.data.objects[f"Supplied_{kind}"] for kind in FOOTPRINTS})
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    assets = []
    for kind, root in ROOTS.items():
        points, triangles = [], 0
        for obj in root.children_recursive:
            if obj.type not in {"MESH", "CURVE"}:
                continue
            mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
            points.extend(obj.matrix_world @ v.co for v in mesh.vertices)
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
            bpy.data.meshes.remove(mesh)
        low = [min(p[i] for p in points) for i in range(3)]
        high = [max(p[i] for p in points) for i in range(3)]
        assets.append({"type": kind, "node": root.name, "footprint": FOOTPRINTS[kind], "grounded": kind != "plumbob",
                       "triangles": triangles, "bounds": {"min": [low[0], low[2], -high[1]],
                                                        "max": [high[0], high[2], -low[1]]}})
    bpy.ops.object.select_all(action="DESELECT")
    for root in ROOTS.values():
        root.select_set(True)
        for obj in root.children_recursive:
            obj.select_set(True)
    destination = PROJECT / "public/models/supplied/furnishings.glb"
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", use_selection=True,
                             export_yup=True, export_animations=False, export_extras=True,
                             export_cameras=False, export_lights=False)
    manifest = {"generator": f"Blender {bpy.app.version_string}", "file": "models/supplied/furnishings.glb",
                "source": "art/blender/sunny-supplied.blend", "license": "CC-BY-SA-4.0", "assets": assets}
    (PROJECT / "src/assets/supplied-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if not args.export_only:
        bpy.ops.wm.save_as_mainfile(filepath=str(PROJECT / manifest["source"]), compress=True)
    print("SUPPLIED_MODELS_EXPORTED", json.dumps(assets))


if __name__ == "__main__":
    main()

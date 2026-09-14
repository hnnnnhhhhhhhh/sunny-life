"""Adapt licensed furniture and vehicle models to existing gameplay dimensions."""
import bpy
import bmesh
import json
import math
import sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art/vendor/neighborhood"
OUT = ROOT / "public/models/neighborhood"


def load(file):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE / file))
    added = set(bpy.data.objects)-before
    matrices = {obj:obj.matrix_world.copy() for obj in added}
    meshes = []
    for obj in added:
        if obj.type == "MESH":
            matrix = matrices[obj]
            obj.parent = None
            obj.data.transform(matrix)
            obj.matrix_world = Matrix.Identity(4)
            meshes.append(obj)
    for obj in added-set(meshes):
        bpy.data.objects.remove(obj, do_unlink=True)
    return meshes


def group(name, objects):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for obj in objects:
        obj.parent = root
        obj["asset_source"] = name
    return root


def build_sofa():
    objects = load("sofa.glb")
    for obj in objects:
        for vertex in obj.data.vertices:
            p = vertex.co
            source_z = -p.y
            p.x = (p.x+.01975161)*2.98/2.18844306
            p.y = -( -.56+(source_z+.627700269)*.74/.527700269 if source_z <= -.1
                     else .18+(source_z+.1)*.38/.4951283 )
            height = p.z
            p.z = height*.25/.225 if height < .225 else .25+(height-.225)*.43/.225 if height < .45 else .68+(height-.45)*.50/.3375869
        for material in obj.data.materials:
            if "fabric" not in material.name:
                continue
            material.name = "Dye_Main_sofa"
            material["authoredSurface"] = True
            shader = material.node_tree.nodes.get("Principled BSDF")
            shader.inputs["Base Color"].default_value = (.18, .29, .22, 1)
            shader.inputs["Roughness"].default_value = .86
            shader.inputs["Sheen Weight"].default_value = .4
            shader.inputs["Sheen Tint"].default_value = (.6, .68, .61, 1)
        if obj.data.has_custom_normals:
            obj.data.normals_split_custom_set([(0, 0, 0)]*len(obj.data.loops))
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.data.set_sharp_from_angle(angle=math.radians(65))
    group("Neighborhood_sofa", objects)


def build_curtain():
    objects = load("curtains.glb")
    result = []
    for source in objects:
        for role in ["cloth", "rail"]:
            mesh = source.data.copy()
            bm = bmesh.new()
            bm.from_mesh(mesh)
            remove = [f for f in bm.faces if ("Metal" in mesh.materials[f.material_index].name) == (role == "cloth")]
            bmesh.ops.delete(bm, geom=remove, context="FACES")
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
            bm.to_mesh(mesh);bm.free()
            if not mesh.polygons:
                bpy.data.meshes.remove(mesh);continue
            obj = bpy.data.objects.new(f"Curtain_{role}", mesh)
            bpy.context.scene.collection.objects.link(obj)
            if role == "cloth":
                mod = obj.modifiers.new("Soft fabric folds", "SUBSURF");mod.levels = 2
                bpy.context.view_layer.objects.active=obj;obj.select_set(True)
                bpy.ops.object.modifier_apply(modifier=mod.name);obj.select_set(False)
            for vertex in obj.data.vertices:
                p=vertex.co
                p.x = p.x/3.4688-.01166
                p.z = (p.z+.00586)/4.34448
                p.y /= 4.34448
                if role == "cloth":
                    sign = -1 if p.x < 0 else 1
                    p.x = sign*(.28+min(.205,abs(p.x)*.45))
                    p.y += math.sin(p.z*2.6+abs(p.x)*5)*.007*(1-p.z)
            if obj.data.has_custom_normals:
                obj.data.normals_split_custom_set([(0,0,0)]*len(obj.data.loops))
            for polygon in obj.data.polygons:polygon.use_smooth=True
            for mat in obj.data.materials:
                shader=mat.node_tree.nodes.get("Principled BSDF")
                if "Metal" in mat.name:
                    shader.inputs["Base Color"].default_value=(.16,.21,.19,1)
                    shader.inputs["Metallic"].default_value=.6
                else:
                    mat.name="Curtain_linen"
                    shader.inputs["Base Color"].default_value=(.68,.65,.59,1)
                    shader.inputs["Metallic"].default_value=0
                    shader.inputs["Roughness"].default_value=.95
            if role == "cloth":
                obj["curtainCloth"]=True
                obj.shape_key_add(name="Basis")
                breeze=obj.shape_key_add(name="Breeze")
                for vertex in breeze.data:
                    p=vertex.co
                    p.y+=.012*(1-p.z)**2*math.sin(p.x*28+p.z*5)
                breeze.value=0
            result.append(obj)
        bpy.data.objects.remove(source, do_unlink=True)
    group("Neighborhood_curtains", result)


def build_car(kind):
    objects=load(f"{kind}.glb")
    coordinates=[v.co for obj in objects for v in obj.data.vertices]
    low=Vector([min(p[i] for p in coordinates) for i in range(3)])
    high=Vector([max(p[i] for p in coordinates) for i in range(3)])
    length=4.1 if kind=="van" else 3.6
    scale=length/(high.y-low.y)
    center=(low+high)*.5
    for obj in objects:
        for vertex in obj.data.vertices:
            p=vertex.co
            p.x=(p.x-center.x)*scale
            p.y=(p.y-center.y)*scale
            p.z=(p.z-low.z)*scale
        if "wheel" in obj.name.lower():
            bounds=[v.co for v in obj.data.vertices]
            pivot=(Vector([min(p[i] for p in bounds) for i in range(3)])+
                   Vector([max(p[i] for p in bounds) for i in range(3)]))*.5
            obj.data.transform(Matrix.Translation(-pivot));obj.location=pivot
            obj["wheel"]=True
    group(f"Neighborhood_{kind}", objects)


bpy.ops.wm.read_factory_settings(use_empty=True)
build_sofa()
build_curtain()
for kind in ["sedan", "taxi", "van"]:build_car(kind)
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"art/blender/sunny-neighborhood.blend"),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/"neighborhood.glb"),export_format="GLB",
    export_yup=True,export_animations=False,export_extras=True,export_lights=False,export_cameras=False)
print("NEIGHBORHOOD_COMPLETE")

"""Author the low-poly river-village kit, preserving editable Blender sources."""

import argparse
import json
import math
from pathlib import Path
import random
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_furniture as b

TAU = math.tau
SPECS = {
    "pine": (2.9, 2.9, "#668c47"),
    "oak": (3.8, 3.8, "#8ba95d"),
    "rock": (2.4, 2.4, "#979c99"),
    "log": (1.3, 3.0, "#8b6a45"),
    "townhouse": (4.8, 5.0, "#ce8d78"),
    "tower": (5.2, 5.2, "#b9b9a3"),
    "bridge": (3.2, 8.2, "#a18055"),
    "well": (2.6, 2.6, "#aaa99b"),
    "tent": (3.8, 4.4, "#d4ccb4"),
    "boat": (2.0, 4.4, "#9a754c"),
}


def beam(name, start, end, radius, material, sides=7):
    delta = b.point(*end) - b.point(*start)
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=radius * 0.85,
                                    depth=delta.length, location=(b.point(*start) + b.point(*end)) / 2)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return b.finish(obj, name, material, False)


def ico(name, center, size, material, seed=0, ground=False):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=b.point(*center))
    obj = bpy.context.object
    rng = random.Random(seed)
    for vertex in obj.data.vertices:
        vertex.co *= 0.88 + rng.random() * 0.22
        vertex.co.x *= size[0]
        vertex.co.y *= size[2]
        vertex.co.z *= size[1]
    if ground:
        minimum = min(v.co.z for v in obj.data.vertices)
        for vertex in obj.data.vertices:
            vertex.co.z -= minimum
    return b.finish(obj, name, material, False)


def arch(name, x, y, z, width, height, material, depth=0.06):
    radius = width / 2
    outline = [(-radius, 0), (radius, 0)]
    outline += [(math.cos(i / 10 * math.pi) * radius, height - radius + math.sin(i / 10 * math.pi) * radius) for i in range(11)]
    n = len(outline)
    vertices = [(x + px, y + py, z + side * depth / 2) for side in [-1, 1] for px, py in outline]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return b.mesh_object(name, vertices, faces, material, False)


def window(x, y, z, width=0.72, height=1.15, glowing=False):
    trim = b.mat("Limestone_trim", "#e6d9bb", 0.82)
    glass = b.mat("Warm_window" if glowing else "Blue_window", "#f2cd77" if glowing else "#788995", 0.45)
    if glowing:
        shader = glass.node_tree.nodes["Principled BSDF"]
        shader.inputs["Emission Color"].default_value = (*[b.linear(c / 255) for c in (250, 199, 93)], 1)
        shader.inputs["Emission Strength"].default_value = 0.3
    arch("Arched window glass", x, y, z, width, height, glass)
    r = width / 2
    for side in [-1, 1]:
        b.rounded("Window jamb", (x + side * (r + 0.035), y + (height - r) / 2, z + 0.035),
                  (0.09, height - r, 0.12), trim, 0.014, 1)
    b.tube("Arched stone surround", [(x + math.cos(a) * (r + 0.035), y + height - r + math.sin(a) * (r + 0.035), z + 0.035)
                                    for a in [i / 12 * math.pi for i in range(13)]], 0.047, trim)
    b.rounded("Window crossbar", (x, y + 0.56, z + 0.075), (width, 0.055, 0.07), trim, 0.005, 1)
    b.rounded("Window center mullion", (x, y + height / 2, z + 0.075), (0.055, height, 0.07), trim, 0.005, 1)
    b.rounded("Window sill", (x, y - 0.03, z + 0.09), (width + 0.23, 0.09, 0.28), trim, 0.02, 1)


def pine():
    wood = b.mat("Pine_bark", "#806442")
    beam("Angular trunk", (0, 0, 0), (0.03, 3.9, 0), 0.16, wood)
    colors = [b.mat("Pine_olive", "#7f9b53"), b.mat("Pine_forest", "#5b8046"), b.mat("Pine_light", "#8eaa62")]
    for tier in range(4):
        radius = 1.25 - tier * 0.23
        y = 0.68 + tier * 0.74
        n = 12
        vertices = [(0, y + 1.68 - tier * 0.09, 0)]
        vertices += [(math.cos(i / n * TAU + tier * 0.15) * radius * (0.84 if i % 2 else 1),
                      y + (0.13 if i % 2 else 0), math.sin(i / n * TAU + tier * 0.15) * radius * (0.84 if i % 2 else 1))
                     for i in range(n)]
        faces = [(0, 1 + i, 1 + (i + 1) % n) for i in range(n)]
        faces.append(tuple(range(n, 0, -1)))
        obj = b.mesh_object("Layered serrated pine crown", vertices, faces, colors[tier % 3], False)
        obj.data.materials.append(colors[(tier + 1) % 3])
        for index, face in enumerate(obj.data.polygons):
            face.material_index = 1 if index % 4 == 0 else 0


def oak():
    wood = b.mat("Oak_bark", "#8b6846")
    beam("Forked oak trunk", (0, 0, 0), (0.06, 2.9, 0), 0.18, wood)
    for x, y, z in [(-0.8, 2.8, 0.1), (0.7, 3.1, 0.2), (0.1, 3.3, -0.6)]:
        beam("Angular oak branch", (0, 1.6, 0), (x, y, z), 0.09, wood)
    for i, (x, y, z, size) in enumerate([(-0.73, 2.82, 0.1, 0.96), (0.61, 3.05, 0.24, 1.05), (0.03, 3.64, -0.38, 0.9), (0.05, 2.56, -0.6, 0.85)]):
        ico("Faceted oak foliage", (x, y, z), (size, size * 0.85, size), b.mat(f"Oak_crown_{i % 3}", ["#8ba95d", "#a8b975", "#78964f"][i % 3]), i)


def rock():
    rng = random.Random(148)
    n, vertices, faces = 9, [], []
    for row, (height, radius, offset) in enumerate([(0,.78,0),(.46,1,.05),(1.15,.76,-.12),(1.48,.38,-.2)]):
        for i in range(n):
            angle = i/n*TAU
            r = radius*(.88+rng.random()*.18)
            vertices.append((math.cos(angle)*r+offset, height+(rng.random()-.5)*.13 if row else 0,
                             math.sin(angle)*r*.82))
    for row in range(3):
        for i in range(n):
            a=row*n+i; nxt=row*n+(i+1)%n
            if (i+row)%3 == 0:
                faces.extend([(a,nxt,nxt+n),(a,nxt+n,a+n)])
            else:
                faces.append((a,nxt,nxt+n,a+n))
    faces.extend([tuple(range(n-1,-1,-1)),tuple(range(3*n,4*n))])
    obj = b.mesh_object("Coastal fractured boulder",vertices,faces,b.mat("Rock_mid","#8eaaa9"),False)
    obj.data.materials.append(b.mat("Rock_pale","#c2d0c8"))
    obj.data.materials.append(b.mat("Rock_cool","#697f87"))
    for polygon in obj.data.polygons:
        polygon.material_index = 1 if polygon.normal.z > .45 else 2 if polygon.normal.x > .25 else 0


def log():
    bark = b.mat("Log_bark", "#826044")
    beam("Fallen log", (0, 0.32, -1.3), (0.12, 0.34, 1.3), 0.34, bark, 9)
    beam("Cut end grain", (0.12, 0.34, 1.292), (0.12, 0.34, 1.32), 0.27, b.mat("Cut_timber", "#c19b61"), 9)
    beam("Snapped branch", (0, 0.37, -0.2), (-0.42, 0.68, -0.45), 0.09, bark)


def townhouse():
    plaster = b.mat("Dye_Main_townhouse", "#ce8d78", 0.92)
    trim = b.mat("Limestone_trim", "#e6d9bb", 0.82)
    roof = b.mat("Terra_cotta", "#b97d61")
    dark = b.mat("Walnut_door", "#776357")
    b.rounded("Stone foundation", (0, 0.1, 0), (4.25, 0.2, 3.3), trim, 0.035, 2)
    b.rounded("Pastel plaster facade", (0, 2.65, 0), (4.08, 5.1, 3.1), plaster, 0.045, 2)
    b.rounded("Flat roof deck", (0, 5.23, 0), (4.22, 0.14, 3.24), trim, 0.025, 2)
    for x in [-2.06, 2.06]:
        b.rounded("Raised parapet", (x, 5.43, 0), (0.15, 0.45, 3.27), plaster, 0.04, 2)
        for z in [-1.5, 1.5]:
            b.ellipsoid("Parapet finial", (x, 5.69, z), (0.13, 0.14, 0.13), trim)
    for z in [-1.56, 1.56]:
        b.rounded("Roof parapet edge", (0, 5.39, z), (4.15, 0.4, 0.15), plaster, 0.05, 2)
    for y in [1.63, 3.58]:
        for x in [-1.34, 0, 1.34]:
            window(x, y, 1.585, 0.63, 1.03)
    for x in [-1.34, 1.34]:
        arch("Shop window", x, 0.23, 1.582, 0.77, 1.11, b.mat("Blue_window", "#788995", 0.45))
    arch("Recessed front door", 0, 0.13, 1.59, 0.78, 1.22, dark)
    for x in [-0.25, 0, 0.25]:
        b.rounded("Door plank", (x, 0.56, 1.636), (0.025, 0.78, 0.025), trim, 0)
    b.rounded("Balcony platform", (0, 3.27, 1.78), (3.12, 0.13, 0.65), roof, 0.035, 2)
    b.rounded("Balcony top rail", (0, 3.71, 2.05), (3.2, 0.09, 0.075), dark, 0.015, 2)
    for i in range(13):
        b.rounded("Balcony spindle", ((i - 6) * 0.245, 3.51, 2.05), (0.045, 0.38, 0.05), dark, 0)
    for i in range(8):
        mat = roof if i % 2 == 0 else trim
        awning = b.rounded("Striped shop awning", ((i - 3.5) * 0.48, 1.49, 1.95), (0.475, 0.065, 0.78), mat, 0.018, 2)
        awning.rotation_euler.x = -0.17
        b.rounded("Awning valance", ((i - 3.5) * 0.48, 1.32, 2.32), (0.475, 0.23, 0.06), mat, 0.018, 2)
    b.rounded("Roof access hut", (-0.92, 5.67, -0.55), (1.1, 0.74, 0.98), plaster, 0.03, 2)
    b.lathe("Rooftop clay pot", (1.17, 5.33, -0.65), [(0,0),(0.16,0),(0.21,0.32),(0.18,0.36)], roof, 10)


def tower():
    stone = b.mat("Tower_limestone", "#c1bdab", 0.93)
    wood = b.mat("Tower_timber", "#947046")
    roof = b.mat("Slate_roof", "#66617c")
    b.lathe("Faceted stone tower", (0,0,0), [(0,0),(1.45,0),(1.5,0.2),(1.35,2.8),(1.48,3),(1.48,4.4),(0,4.4)], stone, 12)
    for y, radius in [(0.12,1.51),(1.64,1.48),(2.9,1.56),(4.33,1.61)]:
        b.lathe("Timber belt", (0,0,0), [(radius,y),(radius,y+0.16),(radius-0.11,y+0.16),(radius-0.11,y)], wood, 12)
    for i in range(8):
        a = i / 8 * TAU
        beam("Upper half timber upright", (math.sin(a)*1.45,2.95,math.cos(a)*1.45),
             (math.sin(a)*1.45,4.35,math.cos(a)*1.45), 0.055, wood, 4)
    arch("Tower oak door", 0, 0.08, 1.45, 0.86, 1.24, wood, 0.13)
    for i in range(9):
        a = i / 8 * math.pi
        block = b.rounded("Door arch voussoir", (math.cos(a)*0.58,0.88+math.sin(a)*0.58,1.49), (0.25,0.25,0.23), b.mat("Arch_keystone", "#999b95"), 0.015, 1)
        block.rotation_euler.y = -a
    for x in [-0.57,0.57]:
        for y in [0.2,0.45,0.7]:
            b.rounded("Door arch pier", (x,y,1.49), (0.22,0.24,0.23), b.mat("Arch_keystone", "#999b95"), 0.015, 1)
    for angle in [0, math.pi/2, -math.pi/2]:
        before = set(b.CURRENT.objects)
        window(0, 3.12, 1.49, 0.68, 1.0, True)
        rotation = Matrix.Rotation(angle, 4, "Z")
        for obj in set(b.CURRENT.objects) - before:
            obj.matrix_basis = rotation @ obj.matrix_basis
    window(0.55, 1.94, 1.32, 0.5, 0.79, True)
    rng = random.Random(82)
    for i in range(20):
        a, y = rng.random()*TAU, 0.35+rng.random()*2.3
        if math.cos(a)>0.65 and abs(math.sin(a))<0.5:
            continue
        piece = b.rounded("Exposed stone patch", (math.sin(a)*1.42,y,math.cos(a)*1.42), (0.31,0.19,0.09), b.mat("Tower_stone_patch", "#929a98"), 0.022, 1)
        piece.rotation_euler.z = a
    b.lathe("Wide faceted hat brim", (0,0,0), [(1.35,4.43),(2.1,4.48),(2.12,4.63),(1.46,4.93),(1.22,5.01)], roof, 12)
    profile = [(0,4.7,1.39),(0,5.25,1.02),(0.05,5.9,0.65),(0.24,6.48,0.42),(0.58,6.98,0.22),(0.95,7.18,0.09),(1.28,6.95,0)]
    vertices, faces, n = [], [], 12
    for offset, y, radius in profile:
        vertices += [(offset + math.cos(i/n*TAU)*radius, y, math.sin(i/n*TAU)*radius) for i in range(n)]
    for j in range(len(profile)-1):
        for i in range(n):
            a = j*n+i
            faces.append((a,j*n+(i+1)%n,(j+1)*n+(i+1)%n,a+n))
    hat = b.mesh_object("Crooked pointed roof", vertices, faces, roof, False)
    hat.data.materials.append(b.mat("Slate_roof_light", "#817a90"))
    for i, polygon in enumerate(hat.data.polygons):
        polygon.material_index = 1 if i%12 in [1,2,3] else 0
    b.lathe("Ochre hatband", (0,0,0), [(1.35,4.78),(1.17,5.04),(1.08,5.04),(1.25,4.78)], wood, 12)
    b.rounded("Stone chimney", (-1.15,5.25,-0.1), (0.48,1.34,0.5), b.mat("Arch_keystone", "#999b95"), 0.02, 1)
    b.rounded("Chimney cap", (-1.15,5.96,-0.1), (0.7,0.18,0.65), stone, 0.02, 1)
    brass = b.mat("Telescope_brass", "#c3a157", 0.4, 0.35)
    beam("Telescope barrel", (1.36,4.75,0.2), (2.02,5.07,0.2), 0.14, brass, 10)
    beam("Telescope lens", (2.015,5.067,0.2), (2.05,5.085,0.2), 0.11, b.mat("Lens_glass", "#708d97", 0.2), 10)


def bridge():
    timber = b.mat("Bridge_planks", "#ac8756")
    dark = b.mat("Bridge_structure", "#806745")
    for i in range(25):
        z = -3.9 + i * 7.8 / 24
        height = 0.18 + 0.2 * math.cos(z / 8 * math.pi)
        b.rounded("Individual deck plank", (0,height-0.07,z), (2.72,0.14,0.29), timber, 0.015, 1)
    for side in [-1,1]:
        for z in [-3.7,-2,0,2,3.7]:
            b.rounded("Bridge post", (side*1.39,0.61,z), (0.17,1.22,0.17), dark, 0.017, 1)
            b.rounded("Post cap", (side*1.39,1.25,z), (0.24,0.1,0.24), timber, 0.018, 1)
        b.tube("Hemp handrail", [(side*1.4,1.17+0.11*math.cos(z/8*math.pi),z) for z in [-3.7+i*7.4/40 for i in range(41)]], 0.033, b.mat("Rope", "#c8b387"))
        b.rounded("Longitudinal bearer", (side*0.88,0.13,0), (0.18,0.2,7.9), dark, 0.01, 1)


def well():
    stone = b.mat("Well_stone", "#adae9e")
    dark = b.mat("Well_shadow", "#596660")
    wood = b.mat("Well_oak", "#997449")
    for row in range(3):
        for i in range(12):
            a = i/12*TAU + (row%2)*math.pi/12
            obj = b.rounded("Individual well stone", (math.sin(a)*0.68,0.12+row*0.23,math.cos(a)*0.68), (0.34,0.23,0.24), stone, 0.014, 1)
            obj.rotation_euler.z = a
    b.lathe("Well interior", (0,0,0), [(0,0.04),(0.57,0.04),(0.57,0.05),(0,0.05)], dark, 16)
    for x in [-0.85,0.85]:
        b.rounded("Well roof support", (x,0.94,0), (0.13,1.88,0.14), wood, 0.014, 1)
        roof = b.rounded("Pitched well roof", (x/2,1.93,0), (1.05,0.1,1.75), b.mat("Terra_cotta", "#b97d61"), 0.01, 1)
        roof.rotation_euler.y = math.copysign(0.47, x)
    beam("Well spindle", (-0.9,1.2,0),(0.9,1.2,0),0.05,wood)
    beam("Hanging rope", (0,1.2,0),(0,0.7,0),0.018,b.mat("Rope", "#c8b387"))


def tent():
    linen = b.mat("Tent_linen", "#e4d6b5")
    red = b.mat("Tent_stripe", "#b97063")
    wood = b.mat("Tent_poles", "#8c704a")
    for side in [-1,1]:
        for i in range(8):
            z = -1.9 + i * 0.475
            b.mesh_object("Striped tent canvas", [(side*1.65,0.12,z),(0,2.22,z),(0,2.22,z+0.475),(side*1.65,0.12,z+0.475)], [(0,1,2,3)], linen if i%3 else red, False)
    b.mesh_object("Dark triangular opening", [(-1.43,0.03,1.75),(1.43,0.03,1.75),(0,2.02,1.75)], [(0,1,2)], b.mat("Tent_interior", "#665e4d"), False)
    for z in [-2,2]:
        beam("A frame pole", (-1.7,0,z),(0,2.29,z),0.045,wood)
        beam("A frame pole", (1.7,0,z),(0,2.29,z),0.045,wood)
    b.rounded("Canvas groundsheet", (0,0.022,0),(3.4,0.044,3.85),linen,0)


def boat():
    wood = b.mat("Boat_hull", "#947047")
    inner = b.mat("Boat_inside", "#ba965f")
    n = 14
    vertices, faces = [], []
    for radius, y in [(0.58,0),(1,0.48),(0.85,0.48),(0.49,0.12)]:
        vertices += [(math.sin(i/n*TAU)*0.78*radius,y,math.cos(i/n*TAU)*1.95*radius) for i in range(n)]
    for row in range(3):
        for i in range(n):
            faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
    faces.append(tuple(range(3*n,4*n)))
    b.mesh_object("Faceted rowing boat", vertices, faces, wood, False)
    for z in [-0.75,0.55]:
        b.rounded("Rowing seat", (0,0.38,z),(1.17,0.09,0.27),inner,0.014,1)
    beam("Oar", (-0.55,0.48,-0.2),(0.73,0.48,1.3),0.022,inner)


BUILDERS = {"pine":pine,"oak":oak,"rock":rock,"log":log,"townhouse":townhouse,"tower":tower,"bridge":bridge,"well":well,"tent":tent,"boat":boat}


def main():
    args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--export-only", action="store_true")
    options = parser.parse_args(args)
    project = options.output.resolve()
    b.SPECS = SPECS
    if not options.export_only:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system = "METRIC"
        for index, (name, builder) in enumerate(BUILDERS.items()):
            b.CURRENT = bpy.data.collections.new(f"World_{name}")
            bpy.context.scene.collection.children.link(b.CURRENT)
            b.ROOT = bpy.data.objects.new(f"Asset_{name}", None)
            b.CURRENT.objects.link(b.ROOT)
            b.ROOT["sunny_asset"] = name
            builder()
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            minimum = math.inf
            for obj in b.CURRENT.objects:
                if obj.type not in {"MESH", "CURVE"}:
                    continue
                evaluated = obj.evaluated_get(depsgraph)
                mesh = evaluated.to_mesh()
                minimum = min(minimum, min((obj.matrix_world @ v.co).z for v in mesh.vertices))
                evaluated.to_mesh_clear()
            for obj in b.CURRENT.objects:
                if obj != b.ROOT:
                    obj.location.z -= minimum
            b.ROOT.location = b.point((index%5)*7,0,(index//5)*11)
        for area in bpy.context.screen.areas if bpy.context.screen else []:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_distance = 32
                area.spaces.active.region_3d.view_location = b.point(12,1.5,5)
                area.spaces.active.shading.type = "MATERIAL"
    output = project / "public/models/world"
    output.mkdir(parents=True, exist_ok=True)
    assets = []
    for name in BUILDERS:
        asset = b.export_asset(name, output / f"{name}.glb", "World")
        asset["file"] = f"models/world/{name}.glb"
        assets.append(asset)
    manifest = {"version":1,"generator":f"Blender {bpy.app.version_string}","source":"art/blender/sunny-world.blend","assets":assets}
    (project/"src/assets/world-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    if not options.export_only:
        bpy.ops.wm.save_as_mainfile(filepath=str(project/manifest["source"]),compress=True)
    print("SUNNY_WORLD_COMPLETE "+json.dumps({"assets":len(assets),"bytes":sum(a["bytes"] for a in assets),"triangles":sum(a["triangles"] for a in assets)}))


if __name__ == "__main__":
    main()

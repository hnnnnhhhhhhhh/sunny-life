"""Build editable furniture in Blender and export self-contained game-ready GLBs.

Run with Blender --background --python this_file -- --output <project>.
Use --export-only with an existing .blend to preserve manual modeling edits.
Coordinates in helpers follow the game: X right, Y up, Z front. Blender is Z-up.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
from mathutils import Vector

TAU = math.tau
CURRENT = None
ROOT = None
SPECS = {
    "sofa": (3.0, 1.15, "#829b79"),
    "chair": (1.15, 1.05, "#d3987c"),
    "coffee": (1.55, 0.85, "#be9266"),
    "bed": (2.25, 2.9, "#b1b998"),
    "lamp": (0.65, 0.65, "#eee1c4"),
    "plant": (0.7, 0.7, "#e4d6bb"),
}


def point(x, y, z):
    return Vector((x, -z, y))


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def mat(name, color, roughness=0.7, metallic=0):
    material = bpy.data.materials.get(name)
    if material:
        return material
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    rgb = [linear(int(color[i:i + 2], 16) / 255) for i in (1, 3, 5)]
    material.diffuse_color = (*rgb, 1)
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


def finish(obj, name, material, smooth=True):
    obj.name = name
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    CURRENT.objects.link(obj)
    obj.parent = ROOT
    if material:
        obj.data.materials.append(material)
    if smooth and obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def rounded(name, center, size, material, radius=0.05, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(*center))
    obj = bpy.context.object
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(obj, name, material)
    if radius:
        bevel = obj.modifiers.new("Soft manufactured edges", "BEVEL")
        bevel.width = min(radius, min(size) * 0.49)
        bevel.segments = segments
        bevel.affect = "EDGES"
        normal = obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
    return obj


def ellipsoid(name, center, size, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=point(*center))
    obj = bpy.context.object
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, material)


def mesh_object(name, vertices, faces, material, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([point(*v) for v in vertices], [], faces)
    mesh.update()
    topology = bmesh.new()
    topology.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
    topology.to_mesh(mesh)
    topology.free()
    obj = bpy.data.objects.new(name, mesh)
    CURRENT.objects.link(obj)
    obj.parent = ROOT
    mesh.materials.append(material)
    for face in mesh.polygons:
        face.use_smooth = smooth
    return obj


def tube(name, coordinates, radius, material, closed=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(coordinates) - 1)
    for p, coordinate in zip(spline.points, coordinates):
        p.co = (*point(*coordinate), 1)
    spline.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, curve)
    CURRENT.objects.link(obj)
    obj.parent = ROOT
    curve.materials.append(material)
    return obj


def lathe(name, center, profile, material, segments=48, flutes=0, amplitude=0):
    vertices, faces = [], []
    for radius, height in profile:
        for i in range(segments):
            a = TAU * i / segments
            r = radius + (amplitude * math.cos(a * flutes) if radius > 0 else 0)
            vertices.append((center[0] + r * math.cos(a), center[1] + height, center[2] + r * math.sin(a)))
    for j in range(len(profile) - 1):
        for i in range(segments):
            a, b = j * segments + i, j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    return mesh_object(name, vertices, faces, material)


def piping(name, center, width, depth, radius, material, plane="horizontal"):
    coordinates = []
    for cx, cz, start in [(width / 2 - radius, depth / 2 - radius, 0),
                           (-width / 2 + radius, depth / 2 - radius, 90),
                           (-width / 2 + radius, -depth / 2 + radius, 180),
                           (width / 2 - radius, -depth / 2 + radius, 270)]:
        for step in range(7):
            angle = math.radians(start + step * 15)
            x, z = cx + math.sin(angle) * radius, cz + math.cos(angle) * radius
            coordinates.append((center[0] + x, center[1], center[2] + z) if plane == "horizontal"
                               else (center[0] + x, center[1] + z, center[2]))
    return tube(name, coordinates, 0.0055, material, True)


def foot(name, x, z, height, material):
    return lathe(name, (x, 0, z), [(0.025, 0), (0.047, 0.025), (0.062, height - 0.025), (0.05, height), (0, height)], material, 16)


def duvet_height(u, v):
    return (0.81 + 0.012 * math.sin(u * 29 + v * 6) + 0.008 * math.sin(v * 19 - u * 4)
            - max(0, abs(u - 0.5) - 0.42) * 1.35)


def cloth(name, xcenter, material, bed=False):
    nx, nz = (36, 28) if bed else (18, 24)
    vertices, faces = [], []
    for j in range(nz + 1):
        v = j / nz
        for i in range(nx + 1):
            u = i / nx
            x = (u - 0.5) * (2.12 if bed else 0.62)
            if bed:
                z = -0.35 + v * 1.65
                y = duvet_height(u, v)
            else:
                z = -0.12 + min(v, 0.66) * 0.98
                y = 0.675 - max(0, v - 0.66) * 1.16
                y += math.sin(u * 25 + v * 4) * (0.012 + v * 0.009)
                z += max(0, v - 0.66) * 0.035 + math.sin(u * 19) * v * 0.008
            vertices.append((xcenter + x, y, z))
    for j in range(nz):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    obj = mesh_object(name, vertices, faces, material)
    solid = obj.modifiers.new("Woven thickness", "SOLIDIFY")
    solid.thickness = 0.009
    return obj


def build_sofa():
    fabric = mat("Dye_Main_sofa", SPECS["sofa"][2], 0.94)
    seam = mat("Dye_Seam_sofa", "#6b8265", 0.95)
    oak = mat("Oak_frame", "#a47e56", 0.58)
    linen = mat("Oat_linen", "#e2d8c1", 0.95)
    clay = mat("Clay_linen", "#c1896f", 0.9)
    for x in [-1.27, 1.27]:
        for z in [-0.37, 0.37]:
            foot("Tapered oak foot", x, z, 0.25, oak)
    rounded("Exposed oak rail", (0, 0.25, 0), (2.83, 0.14, 1.01), oak, 0.045)
    rounded("Upholstered base", (0, 0.4, 0), (2.97, 0.3, 1.08), fabric, 0.14, 5)
    rounded("Continuous back", (0, 0.81, -0.43), (2.87, 0.77, 0.25), fabric, 0.115, 5)
    for x in [-1.37, 1.37]:
        rounded("Rounded arm bolster", (x, 0.64, 0), (0.25, 0.42, 1.06), fabric, 0.12, 5)
        piping("Arm top stitching", (x, 0.8, 0), 0.19, 0.92, 0.08, seam)
    for x in [-0.85, 0, 0.85]:
        rounded("Plump seat cushion", (x, 0.574, 0.07), (0.82, 0.21, 0.87), fabric, 0.1, 5)
        piping("Seat welt seam", (x, 0.608, 0.07), 0.78, 0.83, 0.11, seam)
        back = rounded("Loose back cushion", (x, 0.895, -0.285), (0.82, 0.54, 0.24), fabric, 0.115, 5)
        back.rotation_euler.x = math.radians(7)
        piping("Back cushion welt", (x, 0.905, -0.147), 0.75, 0.45, 0.09, seam, "vertical")
        ellipsoid("Cushion tuft", (x, 0.9, -0.139), (0.023, 0.023, 0.013), seam)
    pillow = rounded("Linen scatter cushion", (-0.99, 0.86, 0.11), (0.45, 0.47, 0.17), linen, 0.08, 5)
    pillow.rotation_euler.y = math.radians(-15)
    rounded("Terracotta scatter cushion", (0.98, 0.86, 0.11), (0.4, 0.4, 0.18), clay, 0.085, 5)
    cloth("Draped linen throw", 0.5, linen)
    for i in range(11):
        tube("Throw fringe", [(0.22 + i * 0.055, 0.29, 0.536), (0.225 + i * 0.055, 0.24, 0.54)], 0.006, linen)


def build_chair():
    fabric = mat("Dye_Main_chair", SPECS["chair"][2], 0.91)
    seam = mat("Dye_Seam_chair", "#b07b63", 0.94)
    wood = mat("Oak_frame", "#a47e56", 0.58)
    for x in [-0.34, 0.34]:
        for z in [-0.3, 0.32]:
            foot("Splayed oak leg", x, z, 0.34, wood)
    rounded("Seat base", (0, 0.38, 0.025), (1.0, 0.16, 0.87), wood, 0.07)
    vertices, faces, n = [], [], 48
    for i in range(n + 1):
        a = math.radians(-107 + i / n * 214)
        for radius, y in [(0.545, 0.4), (0.545, 1.11), (0.404, 1.11), (0.404, 0.4)]:
            vertices.append((math.sin(a) * radius, y - abs(math.sin(a)) * 0.095, 0.02 - math.cos(a) * radius))
    for i in range(n):
        for side in range(4):
            a, b = i * 4 + side, i * 4 + (side + 1) % 4
            faces.append((a, a + 4, b + 4, b))
    faces.extend([(3, 2, 1, 0), (n * 4, n * 4 + 1, n * 4 + 2, n * 4 + 3)])
    shell = mesh_object("Sculpted wraparound shell", vertices, faces, fabric)
    bevel = shell.modifiers.new("Soft shell lip", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 3
    rounded("Loose rounded seat", (0, 0.53, 0.1), (0.83, 0.22, 0.78), fabric, 0.105, 5)
    piping("Seat piping", (0, 0.575, 0.1), 0.8, 0.74, 0.17, seam)
    tube("Curved back piping", [(math.sin(a) * 0.49, 1.094 - abs(math.sin(a)) * 0.095, 0.02 - math.cos(a) * 0.49)
                               for a in [math.radians(-103 + i / 48 * 206) for i in range(49)]], 0.006, seam)
    pillow = rounded("Small lumbar pillow", (0, 0.735, -0.14), (0.51, 0.25, 0.2), mat("Oat_linen", "#e2d8c1", 0.95), 0.09, 5)
    pillow.rotation_euler.x = 0.1


def build_coffee():
    wood = mat("Dye_Main_coffee", SPECS["coffee"][2], 0.5)
    dark = mat("Walnut_ribs", "#90704f", 0.56)
    for x in [-0.43, 0.43]:
        lathe("Fluted pedestal", (x, 0, 0), [(0, 0), (0.17, 0), (0.175, 0.04), (0.15, 0.45), (0.15, 0.48), (0, 0.48)], dark, 64, 16, 0.009)
    vertices, faces, n = [], [], 64
    for y in [0.48, 0.6]:
        for i in range(n):
            a = TAU * i / n
            r = 0.96 + math.sin(a * 3 + 0.4) * 0.035
            vertices.append((math.cos(a) * 0.78 * r, y, math.sin(a) * 0.42 * r))
    faces.append(tuple(range(n - 1, -1, -1)))
    faces.append(tuple(range(n, n * 2)))
    for i in range(n):
        faces.append((i, (i + 1) % n, (i + 1) % n + n, i + n))
    top = mesh_object("Organic pebble tabletop", vertices, faces, wood)
    bevel = top.modifiers.new("Rounded table edge", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 4
    normal = top.modifiers.new("Tabletop normals", "WEIGHTED_NORMAL")
    normal.keep_sharp = True
    rounded("Sage book cover", (-0.28, 0.64, 0.06), (0.39, 0.065, 0.27), mat("Book_sage", "#7b9187"), 0.012)
    rounded("Book pages", (-0.28, 0.643, 0.068), (0.368, 0.036, 0.25), mat("Paper", "#eee5cf"), 0.003)
    lathe("Stoneware vase", (0.19, 0.6, -0.08), [(0, 0), (0.09, 0), (0.105, 0.04), (0.12, 0.12), (0.09, 0.2), (0.044, 0.24), (0.041, 0.31), (0.049, 0.325), (0.035, 0.33), (0.032, 0.3)], mat("Ceramic_sand", "#d4ba94", 0.48))
    stemmat = mat("Stem_dried", "#aa9672")
    for i in range(3):
        x = 0.17 + i * 0.05
        tube("Dried stem", [(0.19, 0.83, -0.08), (x, 1.0, -0.085), (x + 0.025, 1.12 + i * 0.035, -0.08)], 0.004, stemmat)
        ellipsoid("Seed head", (x + 0.025, 1.11 + i * 0.035, -0.08), (0.03, 0.068, 0.025), mat("Seed_head", "#d5c399"))
    lathe("Ceramic cup", (0.47, 0.6, 0.2), [(0.05, 0), (0.07, 0.01), (0.076, 0.15), (0.065, 0.15), (0.059, 0.025), (0, 0.025)], mat("Cup_glaze", "#eff0e2", 0.29), 32)
    tube("Cup handle", [(0.53 + 0.048 * math.sin(a), 0.68 + 0.052 * math.cos(a), 0.2) for a in [i / 16 * math.pi for i in range(17)]], 0.012, mat("Cup_glaze", "#eff0e2", 0.29))


def build_bed():
    fabric = mat("Dye_Main_bed", SPECS["bed"][2], 0.94)
    seam = mat("Dye_Seam_bed", "#8f987b", 0.95)
    oak = mat("Oak_frame", "#a47e56", 0.58)
    white = mat("Oat_linen", "#e2d8c1", 0.95)
    for x in [-0.92, 0.92]:
        for z in [-1.2, 1.2]:
            foot("Bed foot", x, z, 0.24, oak)
    rounded("Oak bed frame", (0, 0.3, 0), (2.24, 0.25, 2.88), oak, 0.085, 4)
    rounded("Upholstered headboard", (0, 0.85, -1.32), (2.24, 1.37, 0.19), fabric, 0.09, 5)
    for i in range(8):
        rounded("Channel tuft", ((i - 3.5) * 0.26, 0.95, -1.204), (0.242, 1.03, 0.074), fabric, 0.035, 4)
    rounded("Mattress", (0, 0.515, 0.01), (2.11, 0.27, 2.68), white, 0.12, 5)
    piping("Mattress upper welt", (0, 0.61, 0.01), 2.07, 2.64, 0.18, white)
    rounded("Duvet volume", (0, 0.655, 0.41), (2.1, 0.19, 1.83), fabric, 0.09, 5)
    cloth("Sculpted duvet folds", 0, fabric, True)
    rounded("Folded linen top", (0, 0.81, -0.39), (2.08, 0.065, 0.26), white, 0.025)
    for x in [-0.51, 0.51]:
        rounded("Plump sleeping pillow", (x, 0.742, -0.91), (0.88, 0.205, 0.52), white, 0.098, 6)
        piping("Pillow case seam", (x, 0.761, -0.91), 0.82, 0.46, 0.09, white)
    for i in range(7):
        z = 0.72 + i * 0.06
        tube("Foot quilt stitching", [(x, duvet_height(x / 2.12 + 0.5, (z + 0.35) / 1.65) + 0.006, z)
                                      for x in [i / 40 * 1.97 - 0.985 for i in range(41)]], 0.0025, seam)


def build_lamp():
    fabric = mat("Dye_Main_lamp", SPECS["lamp"][2], 0.91)
    brass = mat("Brushed_brass", "#b49a64", 0.32, 0.65)
    wood = mat("Walnut_ribs", "#90704f", 0.56)
    lathe("Turned foot", (0, 0, 0), [(0, 0), (0.245, 0), (0.265, 0.025), (0.257, 0.06), (0.18, 0.09), (0.05, 0.11), (0.028, 0.15), (0.028, 1.39), (0.045, 1.41)], wood, 48)
    for y in [0.11, 0.71, 1.39]:
        lathe("Brass ferrule", (0, y, 0), [(0.035, 0), (0.04, 0.008), (0.04, 0.036), (0.035, 0.043)], brass, 24)
    lathe("Pleated linen shade", (0, 0, 0), [(0.31, 1.4), (0.312, 1.42), (0.205, 1.82), (0.2, 1.84), (0.189, 1.84), (0.19, 1.82), (0.297, 1.42), (0.297, 1.4), (0.31, 1.4)], fabric, 128, 32, 0.007)
    for y, radius in [(1.411, 0.314), (1.831, 0.202)]:
        tube("Lampshade rolled edge", [(math.cos(a) * radius, y, math.sin(a) * radius) for a in [i / 64 * TAU for i in range(64)]], 0.009, fabric, True)
    lathe("Top finial", (0, 1.81, 0), [(0.015, 0), (0.025, 0.015), (0.025, 0.04), (0, 0.06)], brass, 24)


def build_plant():
    ceramic = mat("Dye_Main_plant", SPECS["plant"][2], 0.54)
    green = mat("Leaf_forest", "#507747", 0.67)
    light = mat("Leaf_sage", "#78975c", 0.71)
    vein = mat("Leaf_vein", "#93a570", 0.76)
    stems = mat("Live_stems", "#678451")
    lathe("Wheel thrown ceramic planter", (0, 0, 0), [(0, 0), (0.185, 0), (0.195, 0.024), (0.199, 0.09), (0.24, 0.42), (0.252, 0.445), (0.252, 0.477), (0.229, 0.487), (0.22, 0.466), (0.21, 0.41), (0.17, 0.09), (0, 0.09)], ceramic, 64)
    lathe("Soil", (0, 0.421, 0), [(0, 0), (0.218, 0), (0.218, 0.007), (0, 0.007)], mat("Potting_soil", "#625139"), 32)
    for leaf_index in range(7):
        angle = leaf_index * 2.4
        dx, dz = math.sin(angle), math.cos(angle)
        height = 0.91 + (leaf_index % 3) * 0.21
        tube("Curved petiole", [(dx * 0.03, 0.43, dz * 0.03), (dx * 0.07, height - 0.2, dz * 0.07), (dx * 0.12, height, dz * 0.12)], 0.011, stems)
        vertices, faces, midrib = [], [], []
        for j in range(21):
            t = j / 20
            length = 0.25 * t
            y = height + math.sin(t * math.pi) * 0.085 - t * 0.22
            x, z = dx * (0.1 + length), dz * (0.1 + length)
            midrib.append((x, y + 0.005, z))
            width = 0.12 * math.sin(math.pi * t) ** 0.7
            width *= 0.57 + 0.43 * abs(math.cos(t * math.pi * 5))
            for side in [-1, 0, 1]:
                vertices.append((x + dz * side * width, y - abs(side) * width * 0.2, z - dx * side * width))
        for j in range(20):
            for side in range(2):
                a = j * 3 + side
                faces.append((a, a + 1, a + 4, a + 3))
        leaf = mesh_object("Split monstera leaf", vertices, faces, green if leaf_index % 2 else light)
        solid = leaf.modifiers.new("Leaf thickness", "SOLIDIFY")
        solid.thickness = 0.003
        tube("Raised central vein", midrib, 0.0025, vein)


BUILDERS = {"sofa": build_sofa, "chair": build_chair, "coffee": build_coffee, "bed": build_bed, "lamp": build_lamp, "plant": build_plant}


def build_scene():
    global CURRENT, ROOT
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    for index, (name, build) in enumerate(BUILDERS.items()):
        CURRENT = bpy.data.collections.new(f"Furniture_{name}")
        bpy.context.scene.collection.children.link(CURRENT)
        ROOT = bpy.data.objects.new(f"Asset_{name}", None)
        CURRENT.objects.link(ROOT)
        ROOT["sunny_asset"] = name
        ROOT["front_axis"] = "-Y"
        ROOT["ground_origin"] = True
        build()
        ROOT.location = point((index % 3) * 4.2, 0, (index // 3) * 4.6)
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("Studio environment")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.65, 0.7, 0.64, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_distance = 14
            area.spaces.active.region_3d.view_location = point(4, 0.5, 2)
            area.spaces.active.shading.type = "MATERIAL"
    bpy.ops.object.select_all(action="DESELECT")


def export_asset(name, destination, collection_prefix="Furniture"):
    collection = bpy.data.collections.get(f"{collection_prefix}_{name}")
    root = bpy.data.objects.get(f"Asset_{name}")
    if not collection or not root:
        raise RuntimeError(f"Missing editable collection/root for {name}")
    offset = root.location.copy()
    root.location = (0, 0, 0)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    temporary = bpy.data.collections.new("__EXPORT__")
    bpy.context.scene.collection.children.link(temporary)
    batches, corners = {}, []
    try:
        for source in collection.objects:
            if source.type not in {"MESH", "CURVE"}:
                continue
            mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), depsgraph=depsgraph)
            obj = bpy.data.objects.new(source.name, mesh)
            temporary.objects.link(obj)
            obj.matrix_world = source.matrix_world.copy()
            for vertex in mesh.vertices:
                p = obj.matrix_world @ vertex.co
                corners.append((p.x, p.z, -p.y))
            material_key = tuple(m.name for m in mesh.materials)
            batches.setdefault(material_key, []).append(obj)
        minimum = [min(p[i] for p in corners) for i in range(3)]
        maximum = [max(p[i] for p in corners) for i in range(3)]
        width, depth, _ = SPECS[name]
        if max(abs(minimum[0]), abs(maximum[0])) > width / 2 + 0.025 or max(abs(minimum[2]), abs(maximum[2])) > depth / 2 + 0.025:
            raise RuntimeError(f"{name} exceeds its game footprint: {minimum} -> {maximum}")
        if abs(minimum[1]) > 0.01:
            raise RuntimeError(f"{name} is not grounded: {minimum[1]}")
        for material_key, objects in batches.items():
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            if len(objects) > 1:
                bpy.ops.object.join()
            objects[0].name = f"{name}__{material_key[0]}"
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.select_all(action="DESELECT")
        triangles = 0
        for obj in temporary.objects:
            obj.select_set(True)
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
        bpy.ops.export_scene.gltf(
            filepath=str(destination), export_format="GLB", use_selection=True,
            export_apply=True, export_yup=True, export_extras=True,
            export_animations=False, export_cameras=False, export_lights=False,
            export_materials="EXPORT", export_texcoords=False,
        )
        content = destination.read_bytes()
        return {"type": name, "file": f"models/blender/{name}.glb",
                "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                "triangles": triangles, "bounds": {"min": minimum, "max": maximum},
                "footprint": [width, depth]}
    finally:
        for obj in list(temporary.objects):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        bpy.data.collections.remove(temporary)
        root.location = offset
        bpy.context.view_layer.update()


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--export-only", action="store_true")
    options = parser.parse_args(args)
    project = options.output.resolve()
    output = project / "public/models/blender"
    output.mkdir(parents=True, exist_ok=True)
    if not options.export_only:
        build_scene()
    assets = [export_asset(name, output / f"{name}.glb") for name in BUILDERS]
    manifest = {"version": 1, "generator": f"Blender {bpy.app.version_string}",
                "source": "art/blender/sunny-furniture.blend", "assets": assets}
    manifest_path = project / "src/assets/blender-manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    if not options.export_only:
        bpy.ops.wm.save_as_mainfile(filepath=str(project / manifest["source"]), compress=True)
    print("SUNNY_EXPORT_COMPLETE " + json.dumps({"assets": len(assets), "bytes": sum(a["bytes"] for a in assets), "triangles": sum(a["triangles"] for a in assets)}))


if __name__ == "__main__":
    main()

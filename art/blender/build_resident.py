"""Build an editable, skinned low-poly resident and authored everyday animations."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_furniture as b

PARTS = []
RIG = None
ROLES = {
    "Skin": ("#e5b896", 0.82), "SkinShade": ("#ca9b7d", 0.86),
    "Hair": ("#574034", 0.9), "HairLight": ("#79563d", 0.91),
    "Top": ("#bdc9b5", 0.9), "TopShade": ("#93a389", 0.92),
    "Undershirt": ("#eee5d4", 0.95), "Trousers": ("#677d78", 0.93),
    "TrouserCuff": ("#50655f", 0.95), "Shoes": ("#eee5d1", 0.77),
    "Sole": ("#c8c1ac", 0.91), "EyeWhite": ("#e9e0d2", 0.76),
    "Iris": ("#51473a", 0.6), "Brows": ("#423329", 0.91),
    "Lips": ("#a97460", 0.85), "Glasses": ("#443e33", 0.5),
    "Metal": ("#b9aa81", 0.38), "Food": ("#dba363", 0.7),
}


def material(role):
    color, roughness = ROLES[role]
    return b.mat(f"Resident_{role}", color, roughness, 0.35 if role == "Metal" else 0)


def register(obj, role, bind, variant=None, accessory=None):
    obj["role"] = role
    if variant:
        obj["variant"] = variant
    if accessory:
        obj["accessory"] = accessory
    PARTS.append((obj, bind, role, variant, accessory))
    return obj


def rounded(name, center, size, role, bind, radius=0.02, variant=None, accessory=None):
    return register(b.rounded(name, center, size, material(role), radius, 1), role, bind, variant, accessory)


def loft(name, rings, role, bind, sides=10, variant=None, phase=0):
    vertices, faces = [], []
    for x, y, z, rx, rz in rings:
        for i in range(sides):
            a = math.tau * i / sides + phase
            vertices.append((x + math.sin(a) * rx, y, z + math.cos(a) * rz))
    for j in range(len(rings) - 1):
        for i in range(sides):
            a, next_i = j * sides + i, j * sides + (i + 1) % sides
            faces.append((a, next_i, next_i + sides, a + sides))
    faces.extend([tuple(range(sides - 1, -1, -1)), tuple(range((len(rings) - 1) * sides, len(rings) * sides))])
    return register(b.mesh_object(name, vertices, faces, material(role), False), role, bind, variant)


def poly(name, vertices, faces, role, bind, variant=None, accessory=None):
    return register(b.mesh_object(name, vertices, faces, material(role), False), role, bind, variant, accessory)


def line(name, coordinates, radius, role, bind, variant=None, accessory=None):
    return register(b.tube(name, coordinates, radius, material(role)), role, bind, variant, accessory)


def arm_weights(side):
    def weights(p):
        y = p.z
        if y > 1.48:
            amount = min(1, max(0, (abs(p.x) - 0.16) / 0.11)) * min(1, max(0.2, (1.70 - y) / 0.18))
            return {"Chest": 1 - amount, f"UpperArm_{side}": amount}
        if y >= 1.40:
            return {f"UpperArm_{side}": 1}
        if y >= 1.26:
            amount = (y - 1.26) / 0.14
            return {f"UpperArm_{side}": amount, f"Forearm_{side}": 1 - amount}
        if y >= 1.055:
            return {f"Forearm_{side}": 1}
        return {f"Hand_{side}": 1}
    return weights


def garment_weights(p):
    if abs(p.x) < 0.18 or p.z < 1.24 and abs(p.x) < 0.21:
        return torso_weights(p)
    side = "L" if p.x < 0 else "R"
    if p.z < 1.48 and abs(p.x) < 0.22:
        return torso_weights(p)
    return arm_weights(side)(p)


def leg_weights(side):
    def weights(p):
        if p.z >= 0.65:
            return {f"Thigh_{side}": 1}
        if p.z <= 0.51:
            return {f"Shin_{side}": 1}
        amount = (p.z - 0.51) / 0.14
        return {f"Thigh_{side}": amount, f"Shin_{side}": 1 - amount}
    return weights


def torso_weights(p):
    if p.z < 1.22:
        return {"Hips": 1}
    amount = min(1, max(0, (p.z - 1.3) / 0.28))
    return {"Spine": 1 - amount, "Chest": amount}


def bone_rig():
    armature = bpy.data.armatures.new("SunnyResidentSkeleton")
    rig = bpy.data.objects.new("SunnyResident", armature)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    definitions = [
        ("Root", (0, 0, 0), (0, 0.12, 0), None),
        ("Hips", (0, 1.08, 0), (0, 1.22, 0), "Root"),
        ("Spine", (0, 1.22, 0), (0, 1.53, 0), "Hips"),
        ("Chest", (0, 1.53, 0), (0, 1.69, 0), "Spine"),
        ("Neck", (0, 1.69, 0), (0, 1.81, 0), "Chest"),
        ("Head", (0, 1.81, 0), (0, 2.14, 0), "Neck"),
        ("Jaw", (0, 1.85, 0.055), (0, 1.92, 0.055), "Head"),
        ("Mouth", (0, 1.895, 0.175), (0, 1.925, 0.175), "Head"),
        ("Nose", (0, 1.95, 0.13), (0, 1.975, 0.13), "Head"),
        ("HandTarget", (0.1, 1.6, 0.3), (0.1, 1.65, 0.3), "Root"),
    ]
    for side, s in [("L", -1), ("R", 1)]:
        definitions.extend([
            (f"UpperArm_{side}", (s * 0.218, 1.635, 0), (s * 0.263, 1.32, 0), "Chest"),
            (f"Forearm_{side}", (s * 0.263, 1.32, 0), (s * 0.278, 1.03, 0), f"UpperArm_{side}"),
            (f"Hand_{side}", (s * 0.278, 1.03, 0), (s * 0.282, 0.9, 0.008), f"Forearm_{side}"),
            (f"Thigh_{side}", (s * 0.115, 1.08, 0), (s * 0.115, 0.58, 0.005), "Hips"),
            (f"Shin_{side}", (s * 0.115, 0.58, 0.005), (s * 0.115, 0.09, 0), f"Thigh_{side}"),
            (f"Foot_{side}", (s * 0.115, 0.09, 0), (s * 0.115, 0.09, 0.19), f"Shin_{side}"),
            (f"Eye_{side}", (s * 0.058, 1.975, 0.13), (s * 0.058, 2.005, 0.13), "Head"),
        ])
    definitions.append(("UtensilTip", (0.282, 0.820, 0.025), (0.282, 0.840, 0.025), "Hand_R"))
    for name, head, tail, parent in definitions:
        bone = armature.edit_bones.new(name)
        bone.head, bone.tail = b.point(*head), b.point(*tail)
        if parent:
            bone.parent = armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    return rig


def body():
    loft("Trousers waist", [(0,1.01,0,0.2,0.105),(0,1.1,0,0.205,0.115),(0,1.22,0,0.17,0.1)], "Trousers", "Hips", 12)
    for side, s in [("L",-1),("R",1)]:
        loft(f"Tailored leg {side}", [(s*.115,1.15,0,.102,.11),(s*.12,.94,0,.103,.106),
             (s*.12,.7,0,.087,.087),(s*.12,.58,.004,.083,.078),(s*.12,.44,0,.08,.082),
             (s*.12,.21,0,.078,.074),(s*.12,.15,0,.077,.07)], "Trousers", leg_weights(side), 8)
        loft(f"Turned cuff {side}", [(s*.12,.16,0,.084,.074),(s*.12,.215,0,.084,.074)], "TrouserCuff", f"Shin_{side}", 8)
        rounded(f"Canvas sneaker {side}", (s*.115,.086,.063), (.188,.15,.335), "Shoes", f"Foot_{side}", .037)
        rounded(f"Rubber sole {side}", (s*.115,.024,.065), (.196,.048,.347), "Sole", f"Foot_{side}", .014)
        for z in [.035,.078,.118]:
            line("Shoe lace", [(s*.115-.057,.165,z),(s*.115+.057,.165,z+.011)], .004, "Undershirt", f"Foot_{side}")
        loft(f"Skin arm {side}", [(s*.248,1.46,0,.044,.049),
             (s*.263,1.33,0,.04,.045),(s*.275,1.17,0,.036,.04),(s*.278,1.025,0,.029,.032)],
             "Skin", arm_weights(side), 8)
        rounded(f"Hand palm {side}", (s*.282,.964,.005), (.066,.12,.044), "Skin", f"Hand_{side}", .015)
        thumb = rounded(f"Thumb {side}", (s*.244,.985,.022), (.026,.061,.032), "Skin", f"Hand_{side}", .009)
        thumb.rotation_euler.y = s * .3
        for finger in range(3):
            rounded(f"Finger crease {side}", (s*(.264+finger*.018),.915,.029), (.011,.035,.004), "SkinShade", f"Hand_{side}", .003)


def face():
    loft("Sculpted face planes", [(0,1.80,.013,.061,.06),(0,1.855,.008,.093,.083),
         (0,1.91,0,.118,.108),(0,1.977,0,.127,.119),(0,2.035,-.005,.12,.11),
         (0,2.10,-.013,.102,.085),(0,2.135,-.018,.056,.047)], "Skin", "Head", 12, phase=math.pi/12)
    for side, s in [("L",-1),("R",1)]:
        loft(f"Ear {side}", [(s*.13,1.942,0,.023,.02),(s*.143,1.98,0,.026,.032),(s*.137,2.02,0,.018,.022)], "Skin", "Head", 6)
        poly(f"Almond eye {side}", [(s*.052-.027,2.005,.116),(s*.052-.012,2.016,.119),(s*.052+.017,2.014,.117),
             (s*.052+.028,2.003,.113),(s*.052+.01,1.996,.118),(s*.052-.016,1.997,.119)], [(0,1,2,3,4,5)], "EyeWhite", f"Eye_{side}")
        rounded(f"Iris {side}", (s*.052,2.005,.121), (.019,.019,.009), "Iris", f"Eye_{side}", .005)
        rounded(f"Eye glint {side}", (s*.052-.003,2.009,.127), (.005,.006,.003), "EyeWhite", f"Eye_{side}", .001)
        line("Sculpted brow", [(s*.052-.03,2.036,.114),(s*.052,2.039,.12),(s*.052+.027,2.03,.114)], .005, "Brows", "Head")
    poly("Faceted nose", [(-.024,1.96,.109),(.024,1.96,.109),(.018,2.006,.105),(-.018,2.006,.105),
         (0,1.973,.163),(-.02,1.953,.127),(.02,1.953,.127)], [(0,3,4),(3,2,4),(2,1,4),(1,6,4),(6,5,4),(5,0,4)], "Skin", "Nose")
    poly("Upper lip", [(-.033,1.915,.116),(-.01,1.922,.122),(0,1.919,.125),(.012,1.922,.122),(.033,1.915,.116),(0,1.912,.124)],
         [(0,1,2,3,4,5)], "Lips", "Jaw")
    poly("Lower lip", [(-.031,1.914,.116),(0,1.913,.125),(.031,1.914,.116),(.016,1.905,.12),(-.015,1.905,.12)],
         [(0,1,2,3,4)], "SkinShade", "Jaw")
    line("Mouth crease", [(-.026,1.916,.124),(0,1.912,.134),(.026,1.916,.124)], .0028, "Lips", "Jaw")


def garment_shell(outfit):
    vertices, faces, lookup = [], [], {}
    hem = 1.17 if outfit == "shirt" else 1.11
    length = 1.335 if outfit == "shirt" else 1.1

    def vertex(p):
        key = tuple(round(value, 6) for value in p)
        if key not in lookup:
            lookup[key] = len(vertices)
            vertices.append(key)
        return lookup[key]

    def face(points):
        faces.append(tuple(vertex(p) for p in points))

    def panel(inner, outer):
        rows = []
        for a, bpoint in zip(inner, outer):
            rows.append([tuple(a[j]*(1-t)+bpoint[j]*t for j in range(3)) for t in [0, .5, 1]])
        for i in range(len(rows)-1):
            for j in range(2):
                face([rows[i][j], rows[i][j+1], rows[i+1][j+1], rows[i+1][j]])
        return rows

    for side, s in [("L",-1),("R",1)]:
        hole = [(s*.222,1.638,0),(s*.211,1.610,.073),(s*.196,1.545,.1),
                (s*.187,1.49,.073),(s*.184,1.467,0),(s*.187,1.49,-.068),
                (s*.196,1.545,-.091),(s*.211,1.610,-.068)]
        front = [(s*.184,hem,.09),(s*.177,1.28,.103),hole[3],hole[2],hole[1]]
        back = [(s*.184,hem,-.105),(s*.177,1.28,-.115),hole[5],hole[6],hole[7]]
        inner = [(s*.04,hem,.129),(s*.041,1.28,.134),(s*.043,1.46,.137),
                 (s*.053,1.565,.126),(s*.075,1.685,.078)]
        center_back = [(0,hem,-.123),(0,1.28,-.131),(0,1.48,-.135),
                       (0,1.59,-.113),(0,1.685,-.073)]
        front_rows = panel(inner,front)
        back_rows = panel(center_back,back)
        face([front[0],back[0],back[1],front[1]])
        face([front[1],back[1],hole[5],hole[4],hole[3]])
        collar_back = (s*.075,1.685,-.073)
        face([inner[-1],front_rows[-1][1],hole[1],hole[0]])
        face([inner[-1],hole[0],collar_back])
        face([hole[0],hole[7],collar_back])
        face([collar_back,hole[7],back_rows[-1][1],center_back[-1]])

        # The armhole belongs to both the torso and sleeve, with shared vertices
        # and weights. There is no detached sleeve cap or shoulder-cover patch.
        previous = hole
        for cx, y, rx, rz, slope in [(.242,1.49,.058,.063,.045),(.263,1.36,.052,.054,.008),
                                      (.277,length,.047,.050,0)]:
            ring = [(s*(cx+math.cos(i*math.tau/8)*rx),y+math.cos(i*math.tau/8)*slope,
                     math.sin(i*math.tau/8)*rz) for i in range(8)]
            for i in range(8):
                j = (i+1)%8
                face([previous[i],previous[j],ring[j],ring[i]])
            previous = ring
        if outfit != "shirt":
            loft("Folded sleeve cuff", [(s*.277,length-.006,0,.05,.053),(s*.277,length+.043,0,.052,.055)],
                 "TopShade", f"Forearm_{side}", 8, outfit)
        if outfit != "cardigan":
            poly("Relaxed folded collar", [(s*.05,1.710,.063),(s*.107,1.672,.108),
                 (s*.090,1.585,.138),(s*.034,1.666,.099)], [(0,1,2,3)], "TopShade", "Chest", outfit)
            rounded("Chest pocket", (s*.118,1.465,.129), (.075,.087,.012), "TopShade", torso_weights, .006, outfit)
        for y in [1.23,1.36,1.48]:
            rounded("Garment button", (s*.049,y,.14), (.011,.011,.005), "Metal", torso_weights, .003, outfit)
    obj = poly("Connected sloped garment",vertices,faces,"Top",garment_weights,outfit)
    obj["shoulder_drop"] = .047


def clothes():
    loft("Cotton inner tee", [(0,1.17,0,.171,.112),(0,1.34,0,.173,.115),
         (0,1.56,0,.192,.116),(0,1.615,0,.20,.09),(0,1.69,0,.082,.068)],
         "Undershirt",torso_weights,12)
    for outfit in ["shirt","jacket","cardigan"]:
        garment_shell(outfit)


def hair():
    for style in ["short","bob","bun","curly"]:
        loft("Sculpted hair crown", [(0,2.04,-.023,.126,.115),(0,2.11,-.022,.118,.099),
             (0,2.165,-.028,.078,.067),(0,2.178,-.027,.026,.027)], "Hair", "Head", 12, f"hair:{style}")
        for side in [-1,1]:
            bottom = 1.72 if style == "bob" else 1.94
            if style == "curly":
                bottom = 1.89
            loft("Layered side locks", [(side*.116,bottom,-.016,.039,.061),(side*.13,(bottom+2.05)/2,-.013,.044,.089),
                 (side*.099,2.1,-.02,.043,.083)], "Hair", "Head", 6, f"hair:{style}")
        poly("Side parted fringe", [(-.13,2.046,.083),(-.025,2.158,.08),(.055,2.145,.096),
             (.097,2.062,.113),(.055,2.037,.12),(.012,2.064,.113),(-.046,2.012,.112)],
             [(0,1,6),(1,2,5,6),(2,3,4,5)], "HairLight", "Head", f"hair:{style}")
        if style == "bob":
            loft("Faceted back hair", [(0,1.72,-.084,.095,.051),(0,1.89,-.099,.132,.055),
                 (0,2.072,-.073,.117,.063)], "Hair", "Head", 10, f"hair:{style}")
        if style == "bun":
            loft("Twisted bun", [(0,2.13,-.092,.055,.054),(0,2.20,-.097,.071,.065),
                 (0,2.25,-.09,.036,.034)], "Hair", "Head", 8, f"hair:{style}")
        if style == "curly":
            for i in range(14):
                a = i / 14 * math.tau
                x,z = math.cos(a)*.123, math.sin(a)*.103-.015
                loft("Angular curl", [(x,2.037,z,.04,.038),(x,2.102+(i%3)*.012,z,.047,.043),
                     (x,2.153+(i%3)*.012,z,.022,.023)], "HairLight" if i%3==0 else "Hair", "Head", 6, f"hair:{style}")


def accessories():
    for s in [-1,1]:
        x = s*.055
        bcoords = [(x-.039,1.95,.165),(x-.043,2.0,.159),(x+.04,2.0,.159),(x+.038,1.95,.165)]
        line("Angular glasses frame", bcoords+[bcoords[0]], .006, "Glasses", "Head", accessory="glasses")
        line("Glasses temple", [(s*.097,1.994,.164),(s*.14,1.986,.028)], .0045, "Glasses", "Head", accessory="glasses")
    line("Glasses bridge", [(-.013,1.982,.165),(0,1.988,.168),(.013,1.982,.165)], .005, "Glasses", "Head", accessory="glasses")
    rounded("Fork handle", (.282,.934,.025), (.022,.124,.012), "Metal", "Hand_R", .007, accessory="fork")
    rounded("Fork shoulder", (.282,.856,.025), (.034,.047,.009), "Metal", "Hand_R", .004, accessory="fork")
    for i in range(3):
        rounded("Fork prong", (.270+i*.012,.828,.025), (.005,.035,.007), "Metal", "Hand_R", .001, accessory="fork")
    rounded("Fork bite", (.282,.818,.027), (.036,.027,.033), "Food", "UtensilTip", .009, accessory="bite")
    # A hidden degenerate point keeps the non-deforming IK target in the glTF skin.
    poly("IK target binding", [(0.1,1.6,.3)]*3, [(0,1,2)], "Skin", "HandTarget", accessory="ik-helper")


def skin_and_pack():
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for source, bind, role, variant, accessory in PARTS:
        mesh = bpy.data.meshes.new_from_object(source.evaluated_get(depsgraph), depsgraph=depsgraph)
        mesh.transform(source.matrix_world)
        obj = bpy.data.objects.new(source.name + "_Skinned", mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = RIG
        for vertex in mesh.vertices:
            weights = bind(vertex.co) if callable(bind) else {bind: 1}
            for name, weight in weights.items():
                if weight <= 0:
                    continue
                group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
                group.add([vertex.index], weight, "REPLACE")
        modifier = obj.modifiers.new("Resident skeleton", "ARMATURE")
        modifier.object = RIG
        if role in {"Skin", "Top", "TopShade", "Trousers", "TrouserCuff", "Shoes"}:
            for polygon in mesh.polygons:
                polygon.use_smooth = True
        key = (role, variant, accessory, source.get("base"))
        groups.setdefault(key, []).append(obj)
    for source, *_ in PARTS:
        bpy.data.objects.remove(source, do_unlink=True)
    for (role, variant, accessory, base), objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects)>1:
            bpy.ops.object.join()
        obj = objects[0]
        obj.name = "_".join(filter(None, ["Resident", role, (variant or "").replace(":", "_"), accessory, base]))
        obj["role"] = role
        if variant:
            obj["variant"] = variant
        if accessory:
            obj["accessory"] = accessory
        if base:
            obj["base"] = base


def pose_values(kind, t):
    values = {}
    seated = kind in {"SitIdle","Eat"} or kind == "SitDown" and t>=1 or kind == "StandUp" and t<=0
    seat = 1 if seated else (min(1,t) if kind=="SitDown" else max(0,1-t) if kind=="StandUp" else 0)
    values["Hips"] = (0,0,0, -0.44*seat)
    for side, sign in [("L",1),("R",-1)]:
        values[f"Thigh_{side}"] = (-1.45*seat,0,0,0)
        values[f"Shin_{side}"] = (1.45*seat,0,0,0)
        values[f"UpperArm_{side}"] = (-.24*seat,0,sign*-.04,0)
        values[f"Forearm_{side}"] = (-.62*seat,0,0,0)
    if kind=="Walk":
        wave = math.sin(t*math.tau)
        values["Hips"] = (0,.035*wave,0,.024*abs(math.sin(t*math.tau)))
        for side, sign in [("L",1),("R",-1)]:
            values[f"Thigh_{side}"] = (.43*wave*sign,0,0,0)
            values[f"Shin_{side}"] = (max(0,-wave*sign)*.5,0,0,0)
            values[f"UpperArm_{side}"] = (-.3*wave*sign,0,0,0)
            values[f"Forearm_{side}"] = (-.13,0,0,0)
    if kind=="Eat":
        lift = (1-math.cos(t*math.tau))/2
        values["UpperArm_R"] = (-.7-.2*lift,0,.1+.3*lift,0)
        values["Forearm_R"] = (-1.0-1.3*lift,0,0,0)
        values["UpperArm_L"] = (-.48,0,-.05,0)
        values["Forearm_L"] = (-.85,0,0,0)
        values["Head"] = (.08+.035*math.sin(t*math.tau),.035*math.sin(t*math.tau),0,0)
        values["Jaw"] = (.035*max(0,math.sin(t*math.tau*4)),0,0,0)
        values["Chest"] = (.025,0,0,0)
    if kind in {"Idle","SitIdle"}:
        values["Chest"] = (.012*math.sin(t*math.tau),0,0,0)
        values["Head"] = (0,.025*math.sin(t*math.tau),.008*math.sin(t*math.tau),0)
    if kind in {"Talk", "Listen"}:
        wave = math.sin(t*math.tau)
        values["Head"] = (.035*wave,.04*wave,0,0)
        values["Chest"] = (0,.035*wave,0,0)
        if kind == "Talk":
            values["UpperArm_R"] = (-.45-.2*wave,0,.12,0)
            values["Forearm_R"] = (-.95-.28*wave,0,0,0)
            values["UpperArm_L"] = (-.14,0,-.08,0)
            values["Forearm_L"] = (-.35,0,0,0)
            values["Jaw"] = (.04*max(0,math.sin(t*math.tau*5)),0,0,0)
    return values


def animations():
    RIG.animation_data_create()
    for name, duration in [("Idle",4),("Walk",1),("SitDown",1.1),("SitIdle",4),("Eat",3),("StandUp",1.0),("Talk",4),("Listen",4)]:
        RIG.animation_data.action = None
        frames = int(duration*24)
        for frame in range(frames+1):
            t = frame/frames
            values = pose_values(name,t)
            for bone in RIG.pose.bones:
                bone.rotation_mode = "XYZ"
                rx,ry,rz,lower = values.get(bone.name,(0,0,0,0))
                bone.rotation_euler = (rx,ry,rz)
                bone.location = (0,lower,0)
                bone.keyframe_insert("rotation_euler",frame=frame+1,group=bone.name)
                bone.keyframe_insert("location",frame=frame+1,group=bone.name)
        action = RIG.animation_data.action
        action.name = name
        action.use_fake_user = True
        track = RIG.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name,1,action)
        track.mute = True
    RIG.animation_data.action = None
    for bone in RIG.pose.bones:
        bone.rotation_euler = (0,0,0)
        bone.location = (0,0,0)


def main():
    global RIG
    parser = argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument("--export-only",action="store_true")
    options = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    project = options.output.resolve()
    if not options.export_only:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        b.CURRENT = bpy.data.collections.new("ResidentDesign")
        bpy.context.scene.collection.children.link(b.CURRENT)
        b.ROOT = None
        RIG = bone_rig()
        body(); clothes(); accessories()
        from artist_parts import attach
        attach(project, register, material("Skin"))
        skin_and_pack()
        animations()
        bpy.data.orphans_purge(do_recursive=True)
        bpy.context.scene.unit_settings.system = "METRIC"
        bpy.context.scene.render.fps = 24
        bpy.context.scene.frame_set(1)
    else:
        RIG = bpy.data.objects["SunnyResident"]
    bpy.ops.object.select_all(action="DESELECT")
    RIG.select_set(True)
    for obj in RIG.children:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = RIG
    out = project/"public/models/resident"
    out.mkdir(parents=True,exist_ok=True)
    destination = out/"resident.glb"
    bpy.ops.export_scene.gltf(filepath=str(destination),export_format="GLB",use_selection=True,
        export_yup=True,export_animations=True,export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,export_extras=True,export_cameras=False,export_lights=False)
    content = destination.read_bytes()
    manifest = {"generator":f"Blender {bpy.app.version_string}","file":"models/resident/resident.glb",
                "source":"art/blender/sunny-resident.blend","bytes":len(content),
                "sha256":hashlib.sha256(content).hexdigest(),"height":2.25,"hipHeight":1.08,
                "animations":["Idle","Walk","SitDown","SitIdle","Eat","StandUp","Talk","Listen"],
                "artist":"Quaternius, Universal Base Characters (CC0)",
                "sourceUrl":"https://quaternius.com/packs/universalbasecharacters.html"}
    (project/"src/assets/resident-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    if not options.export_only:
        bpy.ops.wm.save_as_mainfile(filepath=str(project/manifest["source"]),compress=True)
    print("SUNNY_RESIDENT_COMPLETE "+json.dumps(manifest))


if __name__=="__main__":
    main()

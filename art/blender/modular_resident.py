"""Fit complete CC0 Quaternius characters to Sunny Life's interaction rig."""
import math
import bpy
import bmesh
from mathutils import Vector


def attach(project, rig, register, material):
    sources = {}
    for base in ["female", "male"]:
        with bpy.data.libraries.load(str(project / "art/vendor/quaternius-modular" / f"{base}.blend")) as (data, loaded):
            loaded.objects = data.objects
        sources[base] = {obj.name.split(".")[0]: obj for obj in loaded.objects if obj}
        for obj in loaded.objects:
            if obj:
                bpy.context.scene.collection.objects.link(obj)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for obj in loaded.objects:
            if obj and obj.type == "MESH":
                obj.data = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
                obj.modifiers.clear()

    def mapper(base):
        source = next(o for o in sources[base].values() if o.type == "ARMATURE")
        mapping = {}
        for bone in source.data.bones:
            name = bone.name
            if "." in name:
                stem, side = name.split(".")
                side = "R" if side == "L" else "L"
                mapped = {"UpperArm": "UpperArm", "LowerArm": "Forearm", "Hand": "Hand",
                          "UpperLeg": "Thigh", "LowerLeg": "Shin", "Foot": "Foot"}.get(stem)
                if stem == "Shoulder":
                    target = rig.data.bones[f"UpperArm_{side}"]
                    head = Vector((target.head_local.x * .4, 0, 1.60))
                    tail = target.head_local.copy()
                    mapped = "Chest"
                elif mapped:
                    mapped = f"{mapped}_{side}"
                    target = rig.data.bones[mapped]
                    head, tail = target.head_local.copy(), target.tail_local.copy()
                else:
                    # Finger weights follow their source hand as a single grasp surface.
                    hand = source.data.bones[f"Hand.{name.split('.')[1]}"]
                    target = rig.data.bones[f"Hand_{side}"]
                    mapping[name] = (f"Hand_{side}", hand.head_local.copy(),
                                     hand.tail_local.copy(), target.head_local.copy(), target.tail_local.copy(), .76)
                    continue
            else:
                mapped = {"Abdomen": "Spine", "Torso": "Spine"}.get(name, name)
                target = rig.data.bones.get(mapped)
                if not target:
                    continue
                head, tail = target.head_local.copy(), target.tail_local.copy()
                if name == "Abdomen":
                    tail.z = 1.385
                if name == "Torso":
                    head.z = 1.385
            scale = .76 if name.startswith("Hand.") else 1.22 if name == "Head" else 1.1
            mapping[name] = (mapped, bone.head_local.copy(), bone.tail_local.copy(), head, tail, scale)

        def vertex(point, weights):
            weights = {name: weight for name, weight in weights.items() if name in mapping}
            if not weights:
                raise RuntimeError(f"Source vertex has no deform weights: {point}")
            total = sum(weights.values()) or 1
            result, bound = Vector(), {}
            for name, weight in weights.items():
                if name not in mapping:
                    raise RuntimeError(f"Unmapped source bone: {name}")
                mapped, a, b, c, d, scale = mapping[name]
                axis = (b - a).normalized()
                rotation = axis.rotation_difference((d - c).normalized())
                local = point - a
                along = local.dot(axis)
                length_scale = (d - c).length / (b - a).length
                if mapped in {"Head", "Hand_L", "Hand_R", "Foot_L", "Foot_R"}:
                    length_scale = scale
                fitted = c + rotation @ (local * scale + axis * along * (length_scale - scale))
                result += fitted * (weight / total)
                bound[mapped] = bound.get(mapped, 0) + weight / total
            return result, bound
        return vertex

    mappers = {base: mapper(base) for base in sources}

    def part(base, source_name, role_for_material, variant=None, only=None, accessory=None):
        source = sources[base][source_name]
        names = {g.index: g.name for g in source.vertex_groups}
        buckets = {}
        for polygon in source.data.polygons:
            mat = source.data.materials[polygon.material_index]
            role = role_for_material(mat.name.split(".")[0])
            if role and (only is None or role in only):
                buckets.setdefault(role, []).append(polygon)
        for role, polygons in buckets.items():
            indices = sorted({i for p in polygons for i in p.vertices})
            lookup = {old: new for new, old in enumerate(indices)}
            vertices, bindings = [], []
            for i in indices:
                vertex = source.data.vertices[i]
                p = source.matrix_world @ vertex.co
                weights = {names[g.group]: g.weight for g in vertex.groups if g.weight > .0001}
                fitted, bound = mappers[base](p, weights or {"Head": 1})
                if source_name.endswith("_Feet"):
                    sole = .055 if base == "female" else .063
                    if fitted.z < .28:
                        fitted.z = .28 + (fitted.z - .28) * .28 / (.28 - sole)
                if role == "Top" and fitted.z < 1.3:
                    fitted.z -= .035
                if variant == "cardigan" and role == "Top":
                    fitted.x *= 1.035
                    fitted.y *= 1.04
                if source_name.endswith("_Head"):
                    if role == "Eyes":
                        bound = {"Eye_L" if p.x < 0 else "Eye_R": 1}
                    elif role == "Skin" and abs(p.x) < .023 and p.y < -.158 and 1.62 < p.z < 1.69:
                        bound = {"Head": .4, "Nose": .6}
                if variant == "hair:curly" and fitted.z < 2.0:
                    fitted.x += math.sin(fitted.z * 47) * .009
                vertices.append(fitted)
                bindings.append(bound)
            mesh = bpy.data.meshes.new(f"{base}_{source_name}_{role}")
            mesh.from_pydata(vertices, [], [tuple(lookup[i] for i in p.vertices) for p in polygons])
            mesh.materials.append(material("Iris" if role == "Eyes" else role))
            mesh.update()
            if role in {"Skin", "Top", "Trousers", "Hair", "Undershirt", "Shoes"}:
                for polygon in mesh.polygons:
                    polygon.use_smooth = True
                mesh.set_sharp_from_angle(angle=math.radians(62 if role == "Skin" else 52))
            obj = bpy.data.objects.new(mesh.name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            for i, weights in enumerate(bindings):
                for name, weight in weights.items():
                    group = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
                    group.add([i], weight, "REPLACE")
            obj["base"] = base
            obj["artist_source"] = f"Quaternius/{source_name}"
            if source_name.endswith("_Head") and role == "Skin":
                # Source hair hides an open scalp. Close its actual boundary so
                # exchanging hairstyles cannot expose the inside of the head.
                bm = bmesh.new()
                bm.from_mesh(mesh)
                bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
                rim = [edge for edge in bm.edges if edge.is_boundary and
                       all(v.co.z > 1.84 and v.co.y > -.145 for v in edge.verts)]
                if len(rim) > 12:
                    center = bm.verts.new((0, -.01, 2.055 if base == "female" else 2.09))
                    deform = bm.verts.layers.deform.verify()
                    head_group = obj.vertex_groups.get("Head") or obj.vertex_groups.new(name="Head")
                    center[deform][head_group.index] = 1
                    for edge in rim:
                        bm.faces.new((edge.verts[1], edge.verts[0], center))
                remaining = [edge for edge in bm.edges if edge.is_boundary and
                             all(v.co.z > 1.84 and v.co.y > -.145 for v in edge.verts)]
                bmesh.ops.holes_fill(bm, edges=remaining)
                bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
                bm.to_mesh(mesh)
                bm.free()
                for polygon in mesh.polygons:
                    polygon.use_smooth = True
                mesh.set_sharp_from_angle(angle=math.radians(62))
            register(obj, role, None, variant, accessory)

    for base in ["female", "male"]:
        casual = "Casual" if base == "female" else "Casual2"
        for outfit, source_name in [("shirt", casual), ("jacket", "Suit"), ("cardigan", "Suit")]:
            def body_role(name):
                if name.startswith("Skin"):
                    return "Skin"
                if name in {"White", "Tie"} and source_name == "Suit":
                    return "Undershirt"
                return "Top"
            part(base, f"{source_name}_Body", body_role, outfit)
        part(base, f"{casual}_Legs", lambda n: "Skin" if n.startswith("Skin") else "Trousers")
        part(base, f"{casual}_Feet", lambda n: "Skin" if n.startswith("Skin") else "Shoes")
        part(base, f"{casual}_Feet", lambda n: "Undershirt", accessory="sleep-socks")
        head = f"{casual}_Head"
        def head_role(name):
            if name in {"Skin", "Skin_Darker"}:
                return "Skin"
            if name in {"Eyebrows", "Hair_Brown"}:
                return "Brows"
            if name in {"Eye", "Brown"}:
                return "Eyes"
            return "Hair"
        part(base, head, head_role, only={"Skin", "Brows", "Eyes"})
        for style, source_base, name, hair_mat in [
            ("bob", "female", "Casual_Head", "Hair_Blond"),
            ("short", "male", "Casual_Head", "Hair"),
            ("bun", "female", "Formal_Head", "Red"),
            ("curly", "female", "Formal_Head", "Red"),
        ]:
            # Both packs share the head rig and head scale.
            donor = sources[source_base][name]
            saved = sources[base].get("HairDonor_Head")
            sources[base]["HairDonor_Head"] = donor
            part(base, "HairDonor_Head", lambda n: "Hair" if n == hair_mat else None, f"hair:{style}")
            if saved:
                sources[base]["HairDonor_Head"] = saved
            else:
                del sources[base]["HairDonor_Head"]
    for obj in set(o for group in sources.values() for o in group.values()):
        bpy.data.objects.remove(obj, do_unlink=True)

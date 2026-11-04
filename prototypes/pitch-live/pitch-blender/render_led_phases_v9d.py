"""
Open pitch45_v9d.blend (or v9b), ensure Near/Far have separate mats,
swap LED textures per phase (Near=long, Far=rolled, Short=short),
render pitch45_v9d_p0.png … p2.png.
Run: blender -b pitch45_v9d.blend -P render_led_phases_v9d.py
"""
import bpy
import os
import json
import shutil

OUT = "/workspace/pitch-blender"
PHASES = 3


def find_image_nodes(mat):
    if not mat or not mat.use_nodes:
        return []
    return [n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE"]


def swap_mat_image(mat, path):
    nodes = find_image_nodes(mat)
    if not nodes:
        print("WARN: no image nodes in", mat.name if mat else None)
        return False
    img = None
    base = os.path.basename(path)
    for existing in bpy.data.images:
        if existing.name == base or os.path.abspath(getattr(existing, "filepath", "") or "") == os.path.abspath(path):
            img = existing
            break
    if img is None:
        img = bpy.data.images.load(path)
    else:
        img.filepath = path
        try:
            img.reload()
        except Exception:
            pass
    try:
        img.colorspace_settings.name = "sRGB"
    except Exception:
        pass
    for n in nodes:
        n.image = img
        n.extension = "EXTEND"
    print(f"  swapped {mat.name} → {path}")
    return True


def ensure_near_far_mats(long_mat):
    """Give LED_Far its own material copy so Near/Far can differ."""
    far_obj = bpy.data.objects.get("LED_Far")
    near_obj = bpy.data.objects.get("LED_Near")
    far_mat = bpy.data.materials.get("LED_Far_Phase")
    if far_mat is None:
        far_mat = long_mat.copy()
        far_mat.name = "LED_Far_Phase"
    if far_obj and far_obj.data.materials:
        far_obj.data.materials[0] = far_mat
    # Near keeps long_mat (LED_Long)
    if near_obj and near_obj.data.materials:
        near_obj.data.materials[0] = long_mat
    return far_mat


def export_mapping(out_path):
    src = os.path.join(OUT, "pitch45_v9b-map.json")
    if os.path.exists(src):
        with open(src) as f:
            data = json.load(f)
    else:
        data = {}
    data["version"] = "v9d"
    data["led_phases"] = PHASES
    data["plates"] = [f"pitch45_v9d_p{i}.png" for i in range(PHASES)]
    data["led_near_far_offset"] = True
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Wrote", out_path)


def main():
    long_mat = bpy.data.materials.get("LED_Long")
    short_mat = bpy.data.materials.get("LED_Short")
    if long_mat is None or short_mat is None:
        for m in bpy.data.materials:
            if m.name.startswith("LED") and "Long" in m.name:
                long_mat = long_mat or m
            if m.name.startswith("LED") and "Short" in m.name:
                short_mat = short_mat or m
    print("LED mats:", long_mat, short_mat)
    if long_mat is None or short_mat is None:
        raise RuntimeError("LED_Long / LED_Short not found")

    far_mat = ensure_near_far_mats(long_mat)
    print("Far mat:", far_mat)

    scene = bpy.context.scene
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"

    for pi in range(PHASES):
        near_path = os.path.join(OUT, f"led_long_v9d_p{pi}.png")
        far_path = os.path.join(OUT, f"led_far_v9d_p{pi}.png")
        short_path = os.path.join(OUT, f"led_short_v9d_p{pi}.png")
        for p in (near_path, far_path, short_path):
            if not os.path.exists(p):
                raise FileNotFoundError(p)
        print(f"=== Phase {pi} ===")
        swap_mat_image(long_mat, near_path)
        swap_mat_image(far_mat, far_path)
        swap_mat_image(short_mat, short_path)
        out_png = os.path.join(OUT, f"pitch45_v9d_p{pi}.png")
        scene.render.filepath = out_png
        bpy.ops.render.render(write_still=True)
        print("Rendered", out_png)
        if pi == 0:
            shutil.copy(out_png, os.path.join(OUT, "pitch45_v9d.png"))
            shutil.copy(out_png, "/workspace/pitch45_v9d.png")
        shutil.copy(out_png, f"/workspace/pitch45_v9d_p{pi}.png")

    # restore phase 0 for saved blend
    swap_mat_image(long_mat, os.path.join(OUT, "led_long_v9d_p0.png"))
    swap_mat_image(far_mat, os.path.join(OUT, "led_far_v9d_p0.png"))
    swap_mat_image(short_mat, os.path.join(OUT, "led_short_v9d_p0.png"))
    blend_path = os.path.join(OUT, "pitch45_v9d.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print("Saved", blend_path)
    export_mapping(os.path.join(OUT, "pitch45_v9d-map.json"))
    print("DONE all phases")


if __name__ == "__main__":
    main()

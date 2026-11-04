"""Lower LED ribbon text emission so soft-grey 云足球 stays grey (gentle glow)."""
import bpy

TARGET = {
    # board_emit, text_emit — calmer than v9c's 3.2 / 11.5
    "board": 2.4,
    "text": 4.8,
}

def tune(mat):
    if not mat or not mat.use_nodes:
        print("skip", mat)
        return False
    changed = False
    for n in mat.node_tree.nodes:
        if n.type == "MAP_RANGE":
            old = (n.inputs["To Min"].default_value, n.inputs["To Max"].default_value)
            n.inputs["To Min"].default_value = TARGET["board"]
            n.inputs["To Max"].default_value = TARGET["text"]
            print(f"  {mat.name} MapRange {old} → ({TARGET['board']}, {TARGET['text']})")
            changed = True
    return changed

for name in ("LED_Long", "LED_Short", "LED_Far_Phase"):
    m = bpy.data.materials.get(name)
    print("mat", name, m)
    tune(m)

# also any LED_* mats
for m in bpy.data.materials:
    if m.name.startswith("LED") and m.name not in ("LED_Long", "LED_Short", "LED_Far_Phase"):
        print("extra", m.name)
        tune(m)

out = "/workspace/pitch-blender/pitch45_v9d.blend"
bpy.ops.wm.save_as_mainfile(filepath=out)
print("saved", out)

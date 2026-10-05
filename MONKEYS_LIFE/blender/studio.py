"""Look-development stage: Seven on a dark floor under a key, a rim and a soft fill. Used to judge the model before
any scene is built.   python studio.py out.png [--fur] [--pose NAME] [--cam front|side|three|face|arm] [--size 640x800] [--samples 48]"""
import math, os, sys, time
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seven as S
import poses

def arg(name, default=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default
flag = lambda name: name in sys.argv

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(arg('--samples', 48)); sc.cycles.use_denoising = arg('--denoise', '1') == '1'; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = float(arg('--noise', 0.01))
    sc.cycles.max_bounces = 6; sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False; sc.render.threads_mode = 'AUTO'
    w, h = (int(v) for v in arg('--size', '640x800').split('x')); sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [l.name for l in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items] else 'None'
    return sc

def lamp(name, kind, loc, energy, colour, size=1.0, target=(0, 0, 1.0)):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = colour
    if kind == 'AREA': d.size = size
    ob = bpy.data.objects.new(name, d); ob.location = loc; bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return ob

def stage(sc, mood=None):
    """mood 'flat' = even light for judging the model; 'night' (default) = a dim cool key from above and a warm edge light, the way he will be lit in the swamp."""
    mood = mood or arg('--mood', 'night')
    w = bpy.data.worlds.new('Studio'); w.use_nodes = True; bg = w.node_tree.nodes['Background']; sc.world = w
    bpy.ops.mesh.primitive_plane_add(size=40); floor = bpy.context.object; m = bpy.data.materials.new('Floor'); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']; floor.data.materials.append(m)
    if mood == 'flat':
        bg.inputs['Color'].default_value = (0.012, 0.014, 0.016, 1); p.inputs['Base Color'].default_value = (0.02, 0.022, 0.022, 1); p.inputs['Roughness'].default_value = 0.85; p.inputs['Specular IOR Level'].default_value = 0.1
        lamp('Key', 'AREA', (1.2, -2.8, 1.5), 230, (1.0, 0.92, 0.82), 1.1); lamp('Fill', 'AREA', (-2.8, -1.6, 1.2), 16, (0.55, 0.7, 1.0), 3.0); lamp('Rim', 'AREA', (-1.6, 2.4, 2.2), 430, (0.62, 0.8, 1.0), 0.8)
    else:
        bg.inputs['Color'].default_value = (0.004, 0.007, 0.008, 1); p.inputs['Base Color'].default_value = (0.006, 0.008, 0.008, 1); p.inputs['Roughness'].default_value = 0.35; p.inputs['Specular IOR Level'].default_value = 0.3
        lamp('Key', 'AREA', (-1.7, -2.3, 2.6), 150, (0.80, 0.93, 1.0), 2.2, target=(0, 0, 0.9)); lamp('Fill', 'AREA', (2.6, -2.0, 0.8), 9, (0.45, 0.62, 0.85), 3.0)
        lamp('Rim', 'AREA', (1.9, 2.3, 2.3), 420, (1.0, 0.86, 0.66), 0.9, target=(0, 0, 0.9)); lamp('Kick', 'AREA', (-2.4, 1.8, 1.0), 120, (0.55, 0.78, 1.0), 0.8, target=(0, 0, 0.8))

CAMS = {  # (position, look-at, focal length mm) in metres
    'front': ((0, -5.2, 0.95), (0, 0, 0.78), 60), 'side': ((5.2, -0.2, 0.95), (0, 0, 0.78), 60), 'three': ((2.4, -3.6, 1.15), (0, 0, 0.72), 55),
    'face': ((0.38, -1.25, 1.02), (0, -0.28, 0.9), 85), 'hero': ((0.95, -1.75, 0.92), (0.05, -0.2, 0.62), 70), 'arm': ((0.9, -1.4, 0.9), (0.45, -0.3, 0.45), 70), 'back': ((-2.0, 4.2, 1.2), (0, 0, 0.75), 55),
}

def camera(sc, name, target=None):
    pos, look, fl = CAMS[name]; cd = bpy.data.cameras.new('Cam'); cd.lens = fl; cd.sensor_width = 36; cam = bpy.data.objects.new('Cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = pos; look = target or look; cam.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler(); return cam

if __name__ == '__main__':
    out = sys.argv[1]; t0 = time.time(); sc = reset(); stage(sc)
    sv = S.build(fur=flag('--fur'), fur_count=int(arg('--strands', 450000)), subdiv=int(arg('--subdiv', 2)))
    pname = arg('--pose', 'tpose')
    if pname != 'tpose': poses.apply(sv, pname)
    S.ground(sv); S.device_power(sv, float(arg('--power', 0))); S.face(sv, Blink=float(arg('--blink', 0)), JawOpen=float(arg('--jaw', 0)), BrowUp=float(arg('--brow', 0)))
    cam = arg('--cam', 'front'); head = sv['arm'].matrix_world @ sv['arm'].pose.bones['Head'].head
    camera(sc, cam, target=tuple(head + Vector((0, 0, 0.08))) if cam == 'face' else None)
    if pname == 'look':
        dev = sv['arm'].matrix_world @ (sv['arm'].pose.bones['LeftForeArm'].head.lerp(sv['arm'].pose.bones['LeftHand'].head, 0.56)); S.look_at(sv, dev)
        if cam == 'hero': mid = head.lerp(dev, 0.5); sc.camera.data.lens = 50; sc.camera.location = mid + Vector((0.85, -1.75, 0.38)); sc.camera.rotation_euler = (mid - sc.camera.location).to_track_quat('-Z', 'Y').to_euler()
    if cam == 'face': sc.camera.location = head + Vector((0.42, -1.25, 0.1)); sc.camera.rotation_euler = ((head + Vector((0, -0.05, 0.07))) - sc.camera.location).to_track_quat('-Z', 'Y').to_euler()
    if arg('--mood', 'night') != 'flat':                                                   # a small light by the lens puts the glint in his eyes
        c = sc.camera; M = c.matrix_world.to_3x3(); lamp('Eye', 'AREA', tuple(c.location + M @ Vector((0.22, 0.30, 0.0))), float(arg('--eyelight', 7)), (1.0, 0.97, 0.92), 0.30, target=tuple(head + Vector((0, 0, 0.06))))
    if arg('--crop'):                                                                       # --crop x0,y0,x1,y1 as fractions of the frame: render just that part, for quick checks
        x0, y0, x1, y1 = (float(v) for v in arg('--crop').split(',')); sc.render.use_border = True; sc.render.use_crop_to_border = True; sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = x0, y0, x1, y1
    sc.render.filepath = os.path.abspath(out); bpy.ops.render.render(write_still=True)
    print(f'rendered {out} in {time.time() - t0:.0f}s, strands {sv.get("strands", 0)}')

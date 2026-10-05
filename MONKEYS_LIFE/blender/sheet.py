"""Contact sheet for judging the model: one build, several cameras, tiled into one picture.

    python sheet.py out.png [--views head|body|hands] [--fur] [--pose NAME] [--size 420x520] [--samples 24] [--clay] [--power 0]
"""
import os, sys, time
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seven as S
import poses
import studio

arg, flag = studio.arg, studio.flag

# (name, offset from the target in metres, focal length); targets are found on the posed body
VIEWS = {
    'head': [('front', (0, -1.6, 0.0), 170), ('three', (0.95, -1.3, 0.04), 170), ('side', (1.6, -0.06, 0.0), 170), ('low', (0.55, -1.35, -0.45), 170)],
    'body': [('front', (0, -5.4, 0.1), 60), ('three', (3.2, -4.3, 0.3), 60), ('side', (5.4, -0.2, 0.1), 60), ('back', (-2.2, 4.9, 0.4), 60)],
    'hands': [('lhand', (0.2, -0.9, 0.45), 80), ('device', (0.05, -0.55, 0.75), 70), ('foot', (0.6, -1.0, 0.3), 70)],
}


def targets(sv):
    arm = sv['arm']; M = arm.matrix_world; pb = arm.pose.bones
    head = M @ pb['Head'].head; eyes = (M @ pb['LeftEye'].head + M @ pb['RightEye'].head) / 2
    return dict(head=eyes + Vector((0, 0.045, -0.035)), body=(M @ pb['Spine1'].head), lhand=M @ pb['LeftHand'].head,
                device=M @ pb['LeftForeArm'].head.lerp(pb['LeftHand'].head, 0.56), foot=M @ pb['LeftFoot'].head)


def clay(sv):
    m = bpy.data.materials.new('Clay'); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.32, 0.30, 0.28, 1); p.inputs['Roughness'].default_value = 0.55
    me = sv['body'].data; me.materials[0] = m


if __name__ == '__main__':
    out = sys.argv[1]; t0 = time.time(); sc = studio.reset(); studio.stage(sc)
    sv = S.build(fur=flag('--fur'), fur_count=int(arg('--strands', 450000)), subdiv=int(arg('--subdiv', 2)))
    pname = arg('--pose', 'tpose')
    if pname != 'tpose': poses.apply(sv, pname)
    S.ground(sv); S.device_power(sv, float(arg('--power', 0))); S.face(sv, Blink=float(arg('--blink', 0)), JawOpen=float(arg('--jaw', 0)), BrowUp=float(arg('--brow', 0)))
    if flag('--clay'): clay(sv)
    kind = arg('--views', 'head'); T = targets(sv); tiles = []
    cd = bpy.data.cameras.new('Cam'); cam = bpy.data.objects.new('Cam', cd); sc.collection.objects.link(cam); sc.camera = cam; cd.sensor_width = 36
    for name, off, fl in VIEWS[kind]:
        tgt = T.get(name, T['head' if kind == 'head' else 'body']); cd.lens = fl
        cam.location = tgt + Vector(off); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        path = os.path.abspath(out).replace('.png', f'_{name}.png'); sc.render.filepath = path; bpy.ops.render.render(write_still=True); tiles.append(path)
    from PIL import Image
    ims = [Image.open(p).convert('RGB') for p in tiles]; w, h = ims[0].size; sheet = Image.new('RGB', (w * len(ims), h))
    for i, im in enumerate(ims): sheet.paste(im, (i * w, 0))
    sheet.save(out)
    for p in tiles: os.remove(p)
    print(f'sheet {out} in {time.time() - t0:.0f}s')

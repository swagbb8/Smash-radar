"""The shots of Episode 1's cold open, "ARISE", and the stage they are played on.

How a shot gets made (see NOTES.md for why): every shot has a locked-off camera.
  plate   the swamp without Seven, rendered once with mist at high quality
  frames  Seven, plus the ground / water / grass close round him, for every frame; the rest of the swamp is held out
          (it still shadows and lights him) and the plate shows through behind
Camera moves, grade and sound are added afterwards in post.py.

    st = Stage(quality)            builds the swamp + Seven once
    shot = SHOTS[name]; shot.setup(st); shot.frame(st, t)
"""
import math, os, sys
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seven as S
import anim, finish, studio, swamp

FPS = 24
QUALITY = {   # size of the frame, samples per pixel (frames, plate), fur strands, body subdivision
    'draft':   dict(size=(480, 200), samples=12, plate_samples=24, fur=70000, subdiv=1, noise=0.05),
    'preview': dict(size=(768, 322), samples=40, plate_samples=96, fur=220000, subdiv=2, noise=0.02),
    'final':   dict(size=(1280, 536), samples=112, plate_samples=256, fur=405000, subdiv=2, noise=0.008),
}


class Stage:
    def __init__(self, quality='draft', seven=True, parts=None):
        self.q = dict(QUALITY[quality]); self.quality = quality
        sc = self.sc = studio.reset(); sc.render.resolution_x, sc.render.resolution_y = self.q['size']; sc.cycles.samples = self.q['samples']; sc.cycles.adaptive_threshold = self.q['noise']
        self.set = swamp.build(sc, parts=parts or ('ground', 'water', 'trees', 'canopy', 'vines', 'plants', 'grass', 'branch', 'fog')); self.L = self.set['layout']
        self.sv = S.build(fur=True, fur_count=self.q['fur'], subdiv=self.q['subdiv'], wet=1.0) if seven else None
        if self.sv:
            self.actor = anim.Actor(self.sv); finish.mark_fur(self.sv.get('fur'))
            if self.q['fur'] < 300000: self._thicken(math.sqrt(405000 / self.q['fur']))
        cd = bpy.data.cameras.new('Cam'); cd.sensor_width = 36; cd.clip_start = 0.02; cd.clip_end = 400; self.cam = bpy.data.objects.new('Cam', cd); sc.collection.objects.link(self.cam); sc.camera = self.cam
        self.lamps = []; sc.render.use_persistent_data = True

    def _thicken(self, k):
        cu = self.sv['fur'].data; n = len(cu.points); r = np.empty(n, np.float32); cu.points.foreach_get('radius', r); cu.points.foreach_set('radius', r * k)      # fewer strands in a draft: make each one fatter so he is still covered

    # ---------------------------------------------------------------- camera and lamps
    def camera(self, pos, look, lens=40, fstop=None, focus=None):
        c = self.cam; c.location = pos; c.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler(); c.data.lens = lens; c.data.type = 'PERSP'
        c.data.dof.use_dof = fstop is not None
        if fstop is not None: c.data.dof.aperture_fstop = fstop; c.data.dof.focus_distance = focus if focus is not None else (Vector(look) - Vector(pos)).length
        bpy.context.view_layer.update()

    def lamp(self, name, pos, target, watts, colour=(1, 1, 1), size=0.6, only_seven=True, spread=180.0):
        """A lamp for this shot. only_seven: it lights him and nothing else (so the ground matches the plate)."""
        ob = swamp._area(name, pos, target, watts, colour, size, self.sc, spread=spread); self.lamps.append(ob)
        if only_seven and self.sv: ob.light_linking.receiver_collection = self.sv['collection']
        return ob

    def clear_lamps(self):
        for ob in self.lamps: bpy.data.objects.remove(ob, do_unlink=True)
        self.lamps = []

    def ground(self, x, y): return float(swamp.ground_z(np.array([x]), np.array([y]), self.L)[0])

    # ---------------------------------------------------------------- the two kinds of render
    def _seven_objects(self): return [o for o in self.sv['collection'].objects] if self.sv else []

    def plate_mode(self, fog=True, samples=None):
        sc = self.sc; sc.render.film_transparent = False; sc.render.use_compositing = False; sc.cycles.samples = samples or self.q['plate_samples']; swamp.set_zone(None)
        for o in self._seven_objects(): o.hide_render = True
        for o in self.lamps: o.hide_render = bool(o.light_linking.receiver_collection)             # his own lamps are not part of the plate
        if 'fog' in self.set: self.set['fog'].hide_render = not fog
        sc.render.image_settings.file_format = 'OPEN_EXR'; sc.render.image_settings.color_depth = '16'; sc.render.image_settings.exr_codec = 'ZIP'

    def char_mode(self, plate, center, r0=2.2, r1=3.2, bloom=0.3, fur_raw=0.6):
        """Render only Seven and what is close round him, over the plate (an EXR written by plate_mode)."""
        sc = self.sc; sc.render.film_transparent = True; sc.cycles.samples = self.q['samples']; swamp.set_zone(center, r0, r1)
        for o in self._seven_objects(): o.hide_render = False
        for o in self.lamps: o.hide_render = False
        if 'fog' in self.set: self.set['fog'].hide_render = True
        sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'; sc.render.image_settings.color_mode = 'RGB'
        finish.setup(sc, bloom=bloom, fur_raw=fur_raw, plate=plate)


# ------------------------------------------------------------------------------------------------ shots
class Shot:
    name = ''; dur = 4.0; fog = True; zone = (2.2, 3.2); bloom = 0.3; kind = 'char'           # kind: 'char' = plate + Seven, 'plate' = scenery only
    move = dict(zoom=(1.0, 1.0), drift=(0.0, 0.0), shake=0.0015)                                              # 2D camera move added in post: zoom from..to, drift in frame widths, hand-held shake

    def setup(self, st): pass
    def center(self, st): return (0.5, 1.0)
    def frame(self, st, t): pass
    @property
    def frames(self): return int(round(self.dur * FPS))


BANK = (0.5, 1.3)          # the mud bank he wakes on (swamp.layout 'bank'); he lies with his hips here, head toward -Y


def _wake_keys(st):
    """The key poses of the wake-up, shared by the shots that show it."""
    A = st.actor; hips = (BANK[0], BANK[1]); g = st.ground(*hips)
    k = lambda name, sink, **kw: A.key(name, root=hips, sink=g + sink, **kw)
    return dict(prone=k('prone', -0.07), headup=k('headup', -0.07), pushup=k('pushup', -0.05), quad=k('quad', -0.05), sit=k('sit', -0.04))


class Eyes(Shot):
    """ECU: a face caked in black mud, lying in the grass. Two eyes open in it."""
    name = 's02_eyes'; dur = 7.0; zone = (1.6, 2.4); move = dict(zoom=(1.22, 1.0), drift=(0.0, 0.0), shake=0.0012)

    def setup(self, st):
        self.K = _wake_keys(st); st.actor.apply(self.K['prone']); bpy.context.view_layer.update(); arm = st.sv['arm']; M = arm.matrix_world
        eye = M @ ((arm.pose.bones['LeftEye'].head + arm.pose.bones['RightEye'].head) / 2); self.eye = eye
        st.camera(tuple(eye + Vector((0.92, -0.30, 0.03))), tuple(eye + Vector((0.0, -0.02, -0.01))), lens=90, fstop=3.2)
        st.clear_lamps(); st.lamp('EyeLight', tuple(eye + Vector((0.9, -0.55, 0.35))), tuple(eye), 12, (0.80, 0.95, 0.90), 0.5); st.lamp('Edge', tuple(eye + Vector((-0.6, 0.7, 0.8))), tuple(eye), 60, (0.75, 0.95, 0.85), 0.5)
        self.track = anim.Track([(0.0, self.K['prone']), (5.6, self.K['prone']), (7.4, self.K['headup'], 'in')], st.actor)

    def center(self, st): return (self.eye.x, self.eye.y)

    def frame(self, st, t):
        A = st.actor; A.apply(self.track.at(t)); A.alive(t, breath=1.3, rate=0.24, restless=0.25)
        lid = anim.curve(t, [(0.0, 1.0), (1.3, 1.0), (1.9, 0.55), (2.5, 0.62), (3.0, 0.12)], 'inout'); lid = max(lid, anim.blinks(t, [3.9, 4.2, 5.9]))
        A.face(Blink=lid, BrowDown=anim.curve(t, [(0, 0.0), (3.2, 0.0), (4.4, 0.5), (7, 0.7)]), BrowUp=0.0)
        yaw, pitch = anim.saccades(t, [(0.0, (62, 4)), (3.3, (48, 2)), (4.3, (80, 8)), (4.9, (30, 14)), (5.7, (66, -4)), (6.4, (55, 10))])
        A.gaze_dir(yaw, pitch); S.mud(1.0, 1.0); S.device_power(st.sv, 0.0)


class Rise(Shot):
    """He pushes himself up out of the mud, shaking, and sits back on his haunches."""
    name = 's03_rise'; dur = 9.5; zone = (2.4, 3.4); move = dict(zoom=(1.0, 1.07), drift=(0.0, -0.01), shake=0.0018)

    def setup(self, st):
        self.K = K = _wake_keys(st)
        st.camera((BANK[0] + 3.3, BANK[1] - 3.0, 0.42), (BANK[0] + 0.0, BANK[1] - 0.25, 0.50), lens=42, fstop=4.0)
        st.clear_lamps(); st.lamp('Rim', (BANK[0] - 2.2, BANK[1] + 2.6, 2.4), (BANK[0], BANK[1] - 0.2, 0.5), 900, (0.80, 0.97, 0.88), 1.0); st.lamp('Eye', (BANK[0] + 3.0, BANK[1] - 2.6, 0.9), (BANK[0], BANK[1] - 0.3, 0.7), 60, (0.85, 0.95, 0.90), 0.6)
        self.track = anim.Track([(0.0, K['headup']), (0.6, K['headup']), (3.0, K['pushup'], 'inout'), (3.5, K['pushup']), (5.6, K['quad'], 'inout'), (7.6, K['sit'], 'settle'), (9.5, K['sit'])], st.actor)

    def center(self, st): return (BANK[0], BANK[1] - 0.2)

    def frame(self, st, t):
        A = st.actor; A.apply(self.track.at(t)); strain = anim.curve(t, [(0.0, 0.3), (1.2, 2.6), (3.4, 3.2), (5.4, 1.6), (7.6, 0.6), (9.5, 0.3)])
        A.alive(t, breath=1.8, rate=0.45, restless=0.9, tremble={'armL': strain, 'armR': strain * 0.9, 'Spine2': strain * 0.25})
        A.face(Blink=anim.blinks(t, [1.1, 4.0, 6.3, 8.4]), BrowDown=0.55, JawOpen=anim.curve(t, [(0, 0.0), (1.5, 0.25), (3.2, 0.35), (5.5, 0.15), (8.0, 0.1)]))
        yaw, pitch = anim.saccades(t, [(0.0, (0, -10)), (3.4, (0, -25)), (6.0, (20, 0)), (7.9, (-35, 5)), (8.5, (30, 12)), (9.1, (-10, 20))])
        A.gaze_dir(yaw, pitch); S.mud(anim.curve(t, [(0, 1.0), (4.0, 0.93), (9.5, 0.86)]), 1.0); S.device_power(st.sv, 0.0)


SHOTS = {s.name: s for s in (Eyes(), Rise())}

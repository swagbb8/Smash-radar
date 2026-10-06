"""The shots of Episode 1's cold open, "ARISE", and the stage they are played on.

How a shot gets made (see NOTES.md for why): every shot has a locked-off camera.
  plate   the swamp without Seven, rendered once with mist at high quality
  frames  Seven, plus the ground / water / grass close round him, for every frame; the rest of the swamp is held out
          for the camera (it still shadows, lights and reflects) and the plate shows through behind
Shots seen through his eyes have no Seven in them at all: one wide plate (a panorama, or a set of plates focused at
different distances) is rendered once, and the frames are that plate looked at by a camera that turns (project.py).
Camera moves, eyelids, grade, grain and sound are added afterwards in post.py.

    st = Stage(quality)            builds the swamp + Seven once
    shot = SHOTS[name]; shot.setup(st); shot.frame(st, t)
"""
import math, os, sys
import bpy
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seven as S
import anim, device, finish, fx, studio, swamp

FPS = 24
QUALITY = {   # size of the frame, samples per pixel (frames, plate), fur strands, body subdivision
    'draft':   dict(size=(480, 200), samples=12, plate_samples=24, fur=70000, subdiv=1, noise=0.05),
    'preview': dict(size=(768, 322), samples=40, plate_samples=96, fur=220000, subdiv=2, noise=0.02),
    'final':   dict(size=(1280, 536), samples=112, plate_samples=256, fur=405000, subdiv=2, noise=0.008),
}


class Stage:
    def __init__(self, quality='draft', seven=True, parts=None, fur=True):
        self.q = dict(QUALITY[quality]); self.quality = quality
        sc = self.sc = studio.reset(); sc.render.resolution_x, sc.render.resolution_y = self.q['size']; sc.cycles.samples = self.q['samples']; sc.cycles.adaptive_threshold = self.q['noise']
        self.set = swamp.build(sc, parts=parts or ('ground', 'water', 'trees', 'canopy', 'vines', 'plants', 'grass', 'branch', 'fog')); self.L = self.set['layout']
        self.sv = S.build(fur=fur, fur_count=self.q['fur'], subdiv=self.q['subdiv'], wet=0.8) if seven else None
        if self.sv:
            self.actor = anim.Actor(self.sv); finish.mark_fur(self.sv.get('fur'))
            if fur and self.q['fur'] < 300000: self._thicken(math.sqrt(405000 / self.q['fur']))
            self.splash = fx.Splash(sc, self.sv['collection'])
        cd = bpy.data.cameras.new('Cam'); cd.sensor_width = 36; cd.clip_start = 0.02; cd.clip_end = 400; self.cam = bpy.data.objects.new('Cam', cd); sc.collection.objects.link(self.cam); sc.camera = self.cam
        self.lamps = []; self.cleared = []; sc.render.use_persistent_data = True
        B = self.L['branch']; a, b = Vector(B['a']), Vector(B['b']); d = (b - a); d2 = Vector((d.x, d.y, 0)).normalized(); north = Vector((-d2.y, d2.x, 0))        # along = west to east; north = across it, away from the bed
        self.branch = dict(a=a, b=b, along=d2, north=north, heading=math.atan2(north.x, -north.y), r=B['thick'] / 2)                                            # heading: he faces `north`

    def _thicken(self, k):
        cu = self.sv['fur'].data; n = len(cu.points); r = np.empty(n, np.float32); cu.points.foreach_get('radius', r); cu.points.foreach_set('radius', r * k)      # fewer strands in a draft: make each one fatter so he is still covered

    # ---------------------------------------------------------------- places
    def ground(self, x, y): return float(swamp.ground_z(np.array([x]), np.array([y]), self.L)[0])

    def on_branch(self, x, up=0.0, north=0.0):
        """A point on the branch's top line where it passes x (world), lifted by `up` and moved `north` across it."""
        B = self.branch; u = (x - B['a'].x) / (B['b'].x - B['a'].x); p = B['a'].lerp(B['b'], u); return p + Vector((0, 0, B['r'] + up)) + B['north'] * north

    # ---------------------------------------------------------------- camera and lamps
    def camera(self, pos, look, lens=40, fstop=None, focus=None):
        c = self.cam; c.location = pos; c.rotation_euler = (Vector(look) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler(); c.data.lens = lens; c.data.type = 'PERSP'
        c.data.dof.use_dof = fstop is not None
        if fstop is not None: c.data.dof.aperture_fstop = fstop; c.data.dof.focus_distance = focus if focus is not None else (Vector(look) - Vector(pos)).length
        self.sc.render.resolution_x, self.sc.render.resolution_y = self.q['size']; bpy.context.view_layer.update()

    def lamp(self, name, pos, target, watts, colour=(1, 1, 1), size=0.6, only_seven=True, spread=180.0):
        """A lamp for this shot. only_seven: it lights him and nothing else (so the ground matches the plate)."""
        ob = swamp._area(name, pos, target, watts, colour, size, self.sc, spread=spread); self.lamps.append(ob)
        if only_seven and self.sv: ob.light_linking.receiver_collection = self.sv['collection']
        return ob

    def clear_lamps(self):
        for ob in self.lamps: bpy.data.objects.remove(ob, do_unlink=True)
        self.lamps = []

    def clear_around(self, point, radius):
        """Take out the grass and plants standing within `radius` of a point (after sightline, which starts the list afresh)."""
        c = Vector((point[0], point[1], 0.0))
        for o in self.sc.objects:
            if o.name.startswith(('Grass', 'P_')) and not o.hide_render and (Vector((o.location.x, o.location.y, 0.0)) - c).length < radius: o.hide_render = True; self.cleared.append(o)

    def sightline(self, target, near=0.10, far=0.50, stop=0.55):
        """Greens are dressed for the camera: take out the grass and plants standing between the lens and `target`
        (a cone `near` wide at the lens, `far` wide at the target, ending `stop` metres short of it)."""
        for o in self.cleared: o.hide_render = False
        self.cleared = []; c = Vector(self.cam.location); t = Vector(target); axis = (t - c); dist = axis.length; axis.normalize()
        for o in self.sc.objects:
            if not o.name.startswith(('Grass', 'P_')): continue
            v = Vector(o.location) + Vector((0, 0, 0.2)) - c; s_ = v.dot(axis)
            if s_ < -0.2 or s_ > dist - stop: continue
            if (v - axis * s_).length < near + (far - near) * max(0.0, s_) / dist: o.hide_render = True; self.cleared.append(o)

    # ---------------------------------------------------------------- the kinds of render
    def _seven_objects(self): return [o for o in self.sv['collection'].objects] if self.sv else []

    def plate_mode(self, fog=True, samples=None):
        sc = self.sc; sc.render.film_transparent = False; sc.render.use_compositing = False; sc.cycles.samples = samples or self.q['plate_samples']; swamp.set_zone(None); swamp.set_ripple(None); sc.cycles.sample_clamp_direct = 0.0; sc.cycles.sample_clamp_indirect = 10.0
        for o in self._seven_objects(): o.hide_render = True
        for o in self.lamps: o.hide_render = bool(o.light_linking.receiver_collection)             # his own lamps are not part of the plate
        if 'fog' in self.set: self.set['fog'].hide_render = not fog
        sc.render.image_settings.file_format = 'OPEN_EXR'; sc.render.image_settings.color_depth = '16'; sc.render.image_settings.exr_codec = 'ZIP'

    def debug_mode(self, samples=6, clay=True):
        """A quick flat look at staging and motion: even light, no mist, no leaves overhead, no plate, Seven in pale clay. Seconds per frame."""
        sc = self.sc; sc.render.film_transparent = False; sc.render.use_compositing = False; sc.cycles.samples = samples; sc.cycles.use_adaptive_sampling = False; sc.cycles.max_bounces = 2; swamp.set_zone(None)
        w = bpy.data.worlds.get('Flat') or bpy.data.worlds.new('Flat'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.6, 0.65, 0.65, 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 2.2; sc.world = w
        for o in sc.objects:
            if o.name.startswith(('Crown', 'BigTree', 'SwampAir', 'SkyGap', 'SunShafts', 'FarGlow')): o.hide_render = True
        for o in self.lamps: o.hide_render = True
        if clay and self.sv and not bpy.data.materials.get('Clay'):
            m = bpy.data.materials.new('Clay'); m.use_nodes = True; p_ = m.node_tree.nodes['Principled BSDF']; p_.inputs['Base Color'].default_value = (0.55, 0.36, 0.24, 1); p_.inputs['Roughness'].default_value = 0.6
            me = self.sv['body'].data; me.materials[0] = m
        if not clay: sc.cycles.max_bounces = 6
        sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '8'; sc.view_settings.look = 'None'

    def char_mode(self, plate, center, r0=2.2, r1=3.2, bloom=0.3, fur_raw=0.6):
        """Render only Seven and what is close round him, over the plate (an EXR written by plate_mode)."""
        sc = self.sc; sc.render.film_transparent = True; sc.cycles.samples = self.q['samples']; swamp.set_zone(center, r0, r1); sc.cycles.sample_clamp_direct = 8.0; sc.cycles.sample_clamp_indirect = 3.0      # wet hair throws pin-point glints that would sparkle from frame to frame
        for o in self._seven_objects():
            if not o.name.startswith('Drop'): o.hide_render = False
        for o in self.lamps: o.hide_render = False
        if 'fog' in self.set: self.set['fog'].hide_render = True
        sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'; sc.render.image_settings.color_mode = 'RGB'
        finish.setup(sc, bloom=bloom, fur_raw=fur_raw, plate=plate)


# ------------------------------------------------------------------------------------------------ shots
class Shot:
    name = ''; dur = 4.0; fog = True; zone = (2.2, 3.2); bloom = 0.3; kind = 'char'           # kind: 'char' = plate + Seven; 'pano' / 'focus' = through his eyes (plates only)
    plate = None                                                                              # another shot's name, when this one is filmed from the same camera position
    move = dict(zoom=(1.0, 1.0), drift=(0.0, 0.0), shake=0.0015)                              # 2D camera move added in post: zoom from..to, drift in frame widths, hand-held shake

    def setup(self, st): pass
    def center(self, st): return (0.5, 1.0)
    def frame(self, st, t): pass
    @property
    def frames(self): return int(round(self.dur * FPS))
    @property
    def plate_name(self): return self.plate or self.name


BANK = (0.5, 1.3)          # where his hips are when he lies on the mud bed; his head is toward -Y
SPOT = (0.30, 2.37)        # where he stands knee-deep, under the branch
GRIP_X = 0.35              # where on the branch he catches hold
SEAT_X = 0.62              # where on the branch he ends up sitting


def _wake_keys(st):
    """The key poses of the wake-up, shared by the shots that show it."""
    A = st.actor; g = st.ground(*BANK); k = lambda name, sink, **kw: A.key(name, root=BANK, sink=g + sink, **kw)
    return dict(prone=k('prone', -0.06), headup=k('headup', -0.06), pushup=k('pushup', -0.05), quad=k('quad', -0.05), sit=k('sit', -0.04))


class Eyes(Shot):
    """ECU: a face caked in black mud, lying in the grass. An eye opens in it."""
    name = 's02_eyes'; dur = 5.0; zone = (1.6, 2.4); move = dict(zoom=(1.16, 1.0), drift=(0.0, 0.0), shake=0.0010)

    def setup(self, st):
        self.K = _wake_keys(st); A = st.actor; A.apply(self.K['prone']); bpy.context.view_layer.update(); self.eye = eye = A.point('Eyes')
        aim = eye + Vector((0.0, 0.035, -0.015)); st.camera(tuple(aim + Vector((-0.92, -0.10, 0.02))), tuple(aim), lens=75, fstop=3.2, focus=(eye - (aim + Vector((-0.92, -0.10, 0.02)))).length); st.sightline(tuple(eye), 0.22, 0.45, 0.0); st.clear_around(eye, 0.55)
        st.clear_lamps(); st.lamp('Key', tuple(eye + Vector((-1.3, -0.9, 0.75))), tuple(eye), 26, (0.78, 0.95, 0.88), 0.9); st.lamp('EyeLight', tuple(eye + Vector((-0.9, 0.25, 0.20))), tuple(eye), 3, (0.9, 1.0, 0.95), 0.3)
        st.lamp('Edge', tuple(eye + Vector((0.6, 0.5, 0.9))), tuple(eye), 60, (1.0, 0.86, 0.62), 0.5)
        self.track = anim.Track([(0.0, self.K['prone']), (4.2, self.K['prone']), (5.6, self.K['headup'], 'in')], A)

    def center(self, st): return (self.eye.x, self.eye.y)

    def frame(self, st, t):
        A = st.actor; A.apply(self.track.at(t)); A.alive(t, breath=1.3, rate=0.24, restless=0.2)
        lid = anim.curve(t, [(0.0, 1.0), (0.7, 1.0), (1.0, 0.72), (1.25, 0.95), (1.6, 0.6), (2.3, 0.10)], 'inout'); lid = max(lid, anim.blinks(t, [2.75, 3.05, 4.1]))
        A.face(Blink=lid, BrowDown=anim.curve(t, [(0, 0.0), (2.3, 0.0), (3.2, 0.55), (5, 0.7)]), BrowUp=0.0)
        yaw, pitch = anim.saccades(t, [(0.0, (-58, 2)), (2.5, (-70, 6)), (3.2, (-40, 10)), (3.7, (-78, -6)), (4.3, (-55, 12))])
        A.gaze_dir(yaw, pitch); S.mud(0.86, 1.0); S.device_power(st.sv, 0.0); S.device_cake(1.0)


class Rise(Shot):
    """He pushes himself up out of the mud, shaking, and sits back on his haunches."""
    name = 's03_rise'; dur = 9.0; zone = (2.5, 3.5); move = dict(zoom=(1.0, 1.08), drift=(0.0, -0.012), shake=0.0018)

    def setup(self, st):
        self.K = K = _wake_keys(st); g = st.ground(*BANK)
        st.camera((BANK[0] + 2.75, BANK[1] - 3.55, g + 0.42), (BANK[0] - 0.05, BANK[1] - 0.25, g + 0.47), lens=45, fstop=4.0); st.sightline((BANK[0], BANK[1] - 0.3, g + 0.3), 0.15, 0.85, 0.3)
        st.clear_lamps(); st.lamp('Rim', (BANK[0] - 2.4, BANK[1] + 2.8, 2.6), (BANK[0], BANK[1] - 0.2, 0.6), 700, (1.0, 0.88, 0.66), 1.0)
        st.lamp('Fill', (BANK[0] + 3.0, BANK[1] - 2.2, 1.6), (BANK[0], BANK[1] - 0.3, 0.6), 70, (0.62, 0.86, 0.90), 1.6); st.lamp('Eye', (BANK[0] + 2.5, BANK[1] - 3.3, 0.8), (BANK[0], BANK[1] - 0.3, 0.8), 14, (0.9, 1.0, 0.95), 0.4)
        self.track = anim.Track([(0.0, K['headup']), (0.5, K['headup']), (2.9, K['pushup'], 'inout'), (3.4, K['pushup']), (5.4, K['quad'], 'inout'), (7.3, K['sit'], 'settle'), (9.0, K['sit'])], st.actor)

    def center(self, st): return (BANK[0], BANK[1] - 0.2)

    def frame(self, st, t):
        A = st.actor; A.apply(self.track.at(t)); strain = anim.curve(t, [(0.0, 0.3), (1.2, 2.6), (3.3, 3.2), (5.2, 1.6), (7.3, 0.6), (9.0, 0.3)])
        A.alive(t, breath=1.8, rate=0.45, restless=0.9, tremble={'armL': strain, 'armR': strain * 0.9, 'Spine2': strain * 0.25})
        A.face(Blink=anim.blinks(t, [1.0, 3.9, 6.1, 8.1]), BrowDown=0.55, JawOpen=anim.curve(t, [(0, 0.0), (1.5, 0.25), (3.1, 0.35), (5.3, 0.15), (7.8, 0.1)]))
        yaw, pitch = anim.saccades(t, [(0.0, (0, -10)), (3.3, (0, -25)), (5.8, (20, 0)), (7.6, (-35, 5)), (8.2, (30, 12)), (8.7, (-10, 20))])
        A.gaze_dir(yaw, pitch); S.mud(anim.curve(t, [(0, 0.86), (4.0, 0.82), (9.0, 0.78)]), 1.0); S.device_power(st.sv, 0.0); S.device_cake(1.0)


class Stand(Shot):
    """Knee-deep in the pool he gets to his feet, "standing tall", and the wood towers over him. He looks up."""
    name = 's05_stand'; dur = 5.5; zone = (2.6, 3.6); move = dict(zoom=(1.06, 1.0), drift=(0.0, 0.01), shake=0.0016)

    def setup(self, st):
        A = st.actor; g = st.ground(*SPOT); h = st.branch['heading']; N = st.branch['north']; W = -st.branch['along']
        low = A.key('crouch', root=SPOT, heading=h, sink=g, tweak={'LeftArm': (0.22, -0.35, -0.91), 'LeftForeArm': (0.05, -0.40, -0.92), 'Head': (0, -0.25, 0.97), 'Neck': (0, -0.45, 0.89)})
        up = A.key('stand', root=SPOT, heading=h, sink=g); sunk = A.key('stand', root=SPOT, heading=h, sink=g - 0.05, tweak={'Neck': (0, -0.50, 0.87), 'Head': (0, -0.62, 0.78)})
        look = A.key('lookup', root=SPOT, heading=h, sink=g - 0.05)
        self.track = anim.Track([(0.0, low), (0.3, low), (1.7, up, 'inout'), (2.6, sunk, 'inout'), (3.5, sunk), (4.9, look, 'inout'), (5.5, look)], A)
        c = Vector((SPOT[0], SPOT[1], 0.0)); cam = c + N * 2.55 + W * 1.75 + Vector((0, 0, 0.22)); st.camera(tuple(cam), tuple(c + Vector((0, 0, 0.62))), lens=32, fstop=5.6); st.sightline(tuple(c + Vector((0, 0, 0.4))), 0.1, 0.5, 0.4)
        st.clear_lamps(); st.lamp('Key', tuple(c + N * 3.5 + W * 3.2 + Vector((0, 0, 3.4))), tuple(c + Vector((0, 0, 0.7))), 420, (1.0, 0.86, 0.62), 1.2); st.lamp('Cool', tuple(c - N * 2.5 - W * 2.5 + Vector((0, 0, 2.5))), tuple(c + Vector((0, 0, 0.7))), 260, (0.6, 0.88, 0.95), 1.4)
        st.lamp('Eye', tuple(cam + Vector((0.3, 0, 0.5))), tuple(c + Vector((0, 0, 0.9))), 16, (0.9, 1.0, 0.95), 0.4)

    def center(self, st): return SPOT

    def frame(self, st, t):
        A = st.actor; A.apply(self.track.at(t)); A.alive(t, breath=1.6, rate=0.42, restless=0.8, tremble={'legL': anim.curve(t, [(0, 0.4), (1.2, 1.6), (2.6, 0.5), (5.5, 0.2)]), 'legR': anim.curve(t, [(0, 0.4), (1.2, 1.4), (2.6, 0.5), (5.5, 0.2)])})
        A.face(Blink=anim.blinks(t, [0.8, 2.9, 4.6]), BrowDown=0.45, JawOpen=anim.curve(t, [(0, 0.15), (1.7, 0.25), (3.0, 0.1), (5.0, 0.22)]))
        yaw, pitch = anim.saccades(t, [(0.0, (0, -15)), (1.8, (0, -5)), (2.5, (-8, -40)), (3.3, (25, -5)), (3.8, (-30, 0)), (4.4, (10, 15)), (5.0, (0, 5))])
        A.gaze_dir(yaw, pitch); S.mud(0.74, 1.0); S.device_power(st.sv, 0.0); S.device_cake(1.0)


def _hang_keys(st):
    """Everything to do with hanging from the branch, for the shots that need it: where the hands hold, and the key poses."""
    A = st.actor; g = st.ground(*SPOT); h = st.branch['heading']; N = st.branch['north']; E = st.branch['along']; grip = st.on_branch(GRIP_X, up=0.012); both = ['LeftPalm', 'RightPalm']; up = Vector((0, 0, 1))
    grip1 = grip + E * 0.20                                                                       # where the right hand alone has hold (he faces north: his right is east)
    near = (tuple(grip - E * 0.17 - N * 0.13 - up * 0.26), tuple(-E * 0.7 + N * 0.25 - up * 0.6))     # his left wrist, a hand short of the branch; the elbow out and down
    K = dict(look=A.key('lookup', root=SPOT, heading=h, sink=g - 0.05), crouch=A.key('crouch', root=SPOT, heading=h, sink=g - 0.05))
    K['hang'] = A.key('hang', root=SPOT, heading=h, pin=(both, grip)); K['pull'] = A.key('pullup', root=SPOT, heading=h, pin=(both, grip))
    K['leap'] = A.key('leap', root=SPOT, heading=h, pin=('RightPalm', grip1 - up * 0.30 - N * 0.10)); K['up'] = A.key('leap', root=SPOT, heading=h, pin=(both, grip - up * 0.30 - N * 0.10))
    one = dict(root=SPOT, heading=h, roll=0.16, pin=('RightPalm', grip1)); K['hang1'] = A.key('hang1', reach={'Left': near}, **one); K['look1'] = A.key('hang1look', **one); K['slip1'] = A.key('hang1look', rcurl=(0.5, 0.8, 0.6), **one)
    K['fall'] = A.key('hang1look', root=SPOT, heading=h, pin=('RightPalm', grip1), curl=(0.3, 0.4, 0.3), tweak={'RightArm': (-0.35, -0.55, 0.76), 'RightForeArm': (-0.10, -0.50, 0.86), 'LeftArm': (0.55, -0.60, 0.58), 'LeftForeArm': (0.20, -0.60, 0.77),
                                                                                                         'LeftUpLeg': (0.30, -0.80, -0.50), 'LeftLeg': (0.0, -0.20, -0.98), 'Neck': (0, -0.2, 0.98), 'Head': (0, -0.45, 0.89)})
    return dict(K=K, grip=grip, grip1=grip1, both=both)


class _Branch(Shot):
    """What the three shots filmed from behind him at the branch share: the camera, and the hanging keys."""
    plate = 's07_jump'; zone = (2.7, 3.7)

    def base(self, st):
        H = _hang_keys(st); self.K = H['K']; self.grip = H['grip']; self.grip1 = H['grip1']; self.both = H['both']; N = st.branch['north']; E = st.branch['along']; c = Vector((SPOT[0], SPOT[1], 0.0))
        st.camera(tuple(c - N * 4.9 + E * 2.3 + Vector((0, 0, 0.46))), tuple(c + N * 0.3 - E * 0.15 + Vector((0, 0, 1.02))), lens=38, fstop=5.6); st.sightline(tuple(c + Vector((0, 0, 0.6))), 0.2, 0.9, 0.5)
        st.clear_lamps(); st.lamp('Rim', tuple(c + N * 4.0 - E * 3.0 + Vector((0, 0, 4.2))), tuple(c + Vector((0, 0, 1.2))), 900, (1.0, 0.88, 0.66), 1.2); st.lamp('Fill', tuple(c - N * 4.0 + E * 2.0 + Vector((0, 0, 1.8))), tuple(c + Vector((0, 0, 1.0))), 60, (0.6, 0.86, 0.92), 2.0)

    def center(self, st): return (SPOT[0], SPOT[1] + 0.1)

    def hold(self, st, sag=0.0, one=False):
        """Put the hand(s) back on the branch (after anything that moved his body)."""
        st.actor.pin('RightPalm' if one else self.both, (self.grip1 if one else self.grip) - Vector((0, 0, sag)))

    def swing(self, st, k, pitch, sag=0.0, one=False):
        kk = dict(k); kk['pitch'] = pitch; st.actor.apply(kk); self.hold(st, sag, one)


class Jump(_Branch):
    """From behind: he coils, leaps, and gets one hand on the branch. He swings there, black against the lit mist, the other arm coming up."""
    name = 's07_jump'; dur = 2.7; plate = None; move = dict(zoom=(1.0, 1.05), drift=(0.0, 0.006), shake=0.0022)

    def setup(self, st):
        self.base(st); K = self.K; self.track = anim.Track([(0.0, K['look']), (0.45, K['look']), (0.95, K['crouch'], 'out'), (1.13, K['leap'], 'in'), (1.24, K['hang1'], 'linear')], st.actor); self.catch = 1.24

    def frame(self, st, t):
        A = st.actor
        if t < self.catch: A.apply(self.track.at(t))
        else: tau = t - self.catch; self.swing(st, self.K['hang1'], -0.42 * math.exp(-0.95 * tau) * math.sin(2 * math.pi * 0.62 * tau + 0.25), one=True)
        A.alive(t, breath=2.0, rate=0.6, restless=0.4); A.face(Blink=anim.blinks(t, [0.3, 2.3]), BrowDown=0.5, JawOpen=anim.curve(t, [(0, 0.1), (0.9, 0.2), (1.2, 0.5), (2.0, 0.3)]))
        if t >= self.catch: self.hold(st, one=True)
        A.gaze(tuple(self.grip)); S.mud(0.70, 1.0); S.device_power(st.sv, 0.0); S.device_cake(0.85); st.splash.frame(-1.0)


class Fall(_Branch):
    """His hand comes off. He drops on his back into the pool."""
    name = 's09_fall'; dur = 1.9; move = dict(zoom=(1.05, 1.05), drift=(0.0, 0.0), shake=0.003)

    def setup(self, st):
        self.base(st); self.t_go = 0.22; A = st.actor; A.apply(self.K['look1']); bpy.context.view_layer.update(); seat = A.point('Seat'); self.drop0 = Vector(A.arm.location)
        self.t_hit = self.t_go + math.sqrt(2 * max(0.05, seat.z - 0.10) / 9.81); st.splash.used = 0; st.splash.bursts = []; st.splash.burst(self.t_hit, (seat.x - st.branch['north'].x * 0.25, seat.y - st.branch['north'].y * 0.25), power=1.25, count=300)
        self.track = anim.Track([(0.0, self.K['look1']), (self.t_go, self.K['look1']), (self.t_go + 0.30, self.K['fall'], 'out')], A)

    def frame(self, st, t):
        A = st.actor
        if t < self.t_go: self.swing(st, self.K['look1'], 0.05 * math.sin(4.0 * t), sag=0.05 * t / self.t_go, one=True)
        else:
            tau = t - self.t_go; k = self.track.at(t); z = 0.5 * 9.81 * tau * tau; tu = max(0.0, t - self.t_hit)
            if tu > 0: z = 0.5 * 9.81 * (self.t_hit - self.t_go) ** 2 + 0.75 * (1 - math.exp(-3.5 * tu))                 # the water takes him
            kk = dict(k); kk['pitch'] = -1.25 * anim.ease(tau / 0.42, 'in'); kk['roll'] = 0.16 * (1 - anim.ease(tau / 0.3)); kk['loc'] = self.drop0 - Vector((0, 0, z + 0.05)) - st.branch['north'] * (0.55 * min(tau, 0.5)); A.apply(kk)
        A.alive(t, breath=1.0, rate=0.6, restless=0.3); A.face(Blink=0.0, BrowUp=0.8, JawOpen=0.7); A.gaze_dir(0, 20)
        if t < self.t_go: self.hold(st, sag=0.05 * t / self.t_go, one=True); S.mud(0.62, 1.0); S.device_power(st.sv, 0.5); S.device_cake(0.0); st.splash.frame(t)


class Pull(_Branch):
    """He comes back up out of the water, gets the branch with both hands, and this time holds: he hauls himself up."""
    name = 's12_pull'; dur = 3.6; move = dict(zoom=(1.05, 1.12), drift=(0.0, 0.012), shake=0.0024)

    def setup(self, st):
        self.base(st); A = st.actor; K = self.K; under = dict(K['up']); under['loc'] = K['up']['loc'] - Vector((0, 0, 1.25)); self.t_up = 0.30; self.catch = 0.72
        A.apply(under); bpy.context.view_layer.update(); p = A.point('Head'); st.splash.used = 0; st.splash.bursts = []; st.splash.burst(self.t_up + 0.08, (p.x, p.y), power=1.0, count=260)
        self.track = anim.Track([(0.0, under), (self.t_up, under), (self.catch, K['hang'], 'out')], A)
        self.haul = anim.Track([(0.0, K['hang']), (0.55, K['hang']), (1.9, K['pull'], 'inout'), (3.0, K['pull'])], A)

    def frame(self, st, t):
        A = st.actor
        if t < self.catch: A.apply(self.track.at(t))
        else: tau = t - self.catch; self.swing(st, self.haul.at(tau), -0.22 * math.exp(-1.3 * tau) * math.sin(2 * math.pi * 0.62 * tau + 0.2))
        strain = anim.curve(t, [(0, 0.5), (1.2, 1.0), (2.2, 3.0), (3.6, 2.2)]); A.alive(t, breath=2.2, rate=0.7, restless=0.4, tremble={'armL': strain, 'armR': strain})
        A.face(Blink=anim.blinks(t, [0.5, 1.6]), BrowDown=0.8, JawOpen=anim.curve(t, [(0, 0.6), (1.0, 0.3), (2.2, 0.55), (3.6, 0.4)])); A.gaze(tuple(self.grip))
        if t >= self.catch: self.hold(st); S.mud(0.42, 1.0); S.device_power(st.sv, 0.35); S.device_cake(0.0); st.splash.frame(t)


class Arm(Shot):
    """Close, from in front: one hand has the branch, the other is on its way up, and stops. In the meat of his forearm, a hand's width from his eyes, is something that is not him. He freezes. His fingers begin to slip."""
    name = 's08_arm'; dur = 4.4; zone = (1.8, 2.6); bloom = 0.55; move = dict(zoom=(1.0, 1.10), drift=(0.0, -0.006), shake=0.0014)

    def setup(self, st):
        A = st.actor; N = st.branch['north']; W = -st.branch['along']; H = _hang_keys(st); K = H['K']; self.grip1 = H['grip1']
        A.apply(K['look1']); bpy.context.view_layer.update(); eye = A.point('Eyes'); dev, nrm = A.device(); mid = eye.lerp(dev, 0.55); cam = mid + N * 1.32 + W * 0.22 + Vector((0, 0, 0.24))
        st.camera(tuple(cam), tuple(mid + Vector((0, 0, 0.035))), lens=46, fstop=3.2, focus=(eye.lerp(dev, 0.5) - cam).length)
        st.clear_lamps(); st.lamp('Key', tuple(mid + N * 1.6 + W * 1.8 + Vector((0, 0, 1.6))), tuple(mid), 120, (1.0, 0.86, 0.62), 0.8); st.lamp('Cool', tuple(mid - N * 1.2 - W * 1.6 + Vector((0, 0, 1.2))), tuple(mid), 110, (0.6, 0.88, 0.95), 0.8)
        st.lamp('Eye', tuple(cam + Vector((0.1, 0, 0.12))), tuple(eye), 5, (0.9, 1.0, 0.95), 0.3)
        self.track = anim.Track([(0.0, K['hang1']), (0.55, K['hang1']), (1.25, K['look1'], 'inout'), (3.3, K['look1']), (4.4, K['slip1'], 'in')], A)

    def center(self, st): return (self.grip1.x, self.grip1.y - 0.1)

    def frame(self, st, t):
        A = st.actor; k = dict(self.track.at(t)); k['pitch'] = 0.05 * math.sin(2 * math.pi * 0.62 * t + 1.0) * math.exp(-0.5 * t); A.apply(k)
        A.alive(t, breath=anim.curve(t, [(0, 2.2), (1.2, 2.0), (1.7, 0.3), (4.4, 0.3)]), rate=0.7, restless=anim.curve(t, [(0, 0.6), (1.2, 0.5), (1.7, 0.05), (4.4, 0.05)]), tremble={'armR': anim.curve(t, [(0, 1.0), (3.2, 1.4), (4.4, 3.5)])})
        A.pin('RightPalm', self.grip1 - Vector((0, 0, 0.06 * anim.ease((t - 3.3) / 1.1, 'in'))))
        A.face(Blink=anim.blinks(t, [0.3]), BrowUp=anim.curve(t, [(0, 0.0), (1.2, 0.0), (1.6, 0.9), (4.4, 1.0)]), BrowDown=anim.curve(t, [(0, 0.5), (1.2, 0.4), (1.5, 0.0)]), JawOpen=anim.curve(t, [(0, 0.35), (1.2, 0.3), (1.8, 0.12), (4.4, 0.2)]))
        dev, _ = A.device()
        if t < 0.62: A.gaze(tuple(self.grip1 + Vector((0, 0, 0.1))))
        elif t < 4.05: A.gaze(tuple(dev))
        else: A.gaze(tuple(self.grip1))                                                           # too late he looks back up at his hand
        flick = 0.0 if t < 0.40 else (0.55 if (t < 0.75 and int(t * 24) % 3 == 0) else anim.curve(t, [(0.75, 0.12), (1.5, 0.42), (4.4, 0.55)]))
        S.mud(0.62, 1.0); S.device_power(st.sv, flick, wave=(t - 2.1) * 22.0 if t >= 2.1 else None); S.device_cake(anim.curve(t, [(0, 0.85), (0.4, 0.85), (0.9, 0.0)]))      # the caked mud cracks off it as the arm swings up


def _perch_keys(st):
    A = st.actor; h = st.branch['heading']; seat = st.on_branch(SEAT_X, up=0.085)
    a = A.key('perch', root=SPOT, heading=h, pin=('Seat', seat), tweak={'LeftArm': (0.30, -0.40, -0.87), 'LeftForeArm': ((-0.45, -0.78, -0.43), 0.0, ((0, 0, 1), (0.25, -0.35, 0.90))), 'LeftHand': ((-0.50, -0.80, -0.33), 0.0, ((0, 0, 1), (0.25, -0.35, 0.90))),
                                                                  'Neck': (0, -0.30, 0.95), 'Head': (0, -0.20, 0.98)})
    b = A.key('perch', root=SPOT, heading=h, pin=('Seat', seat)); c = A.key('perch', root=SPOT, heading=h, pin=('Seat', seat), tweak={'Spine2': (0, -0.44, 0.90), 'Neck': (0.03, -0.60, 0.80), 'Head': (0.08, -0.64, 0.76)})
    return dict(a=a, b=b, c=c, seat=seat)


def _study(st, K, t, light=1.6):
    """His performance on the branch (the same from every camera): he settles, stares, reaches, touches it. It wakes."""
    A = st.actor; track = anim.Track([(0.0, K['a']), (0.5, K['a']), (1.9, K['b'], 'inout'), (5.9, K['b']), (6.05, K['b']), (8.0, K['c'], 'inout'), (9.0, K['c'])], A); A.apply(track.at(t)); A.pin('Seat', K['seat'])
    A.alive(t, breath=anim.curve(t, [(0, 2.0), (3.0, 1.3), (5.6, 0.5), (9, 0.7)]), rate=0.5, restless=anim.curve(t, [(0, 0.8), (2.5, 0.3), (9, 0.15)])); A.pin('Seat', K['seat'])
    dev, nrm = A.device(); touch = 5.6
    if t > 3.9:                                                                              # the right hand comes across, one finger out
        A.curl('Right', (0.9, 1.3, 1.0), index=(0.06, 0.10, 0.06)); bpy.context.view_layer.update(); rest = A.point('RightTip'); w = anim.ease((t - 3.9) / (touch - 3.9), 'inout') if t < touch else 1.0
        east = st.branch['along']; hover = dev + nrm * 0.05 + east * 0.02; goal = dev + nrm * 0.006; tip = rest.lerp(hover, anim.ease(w / 0.8, 'inout')) if w < 0.8 else hover.lerp(goal, anim.ease((w - 0.8) / 0.2, 'in'))
        if t > touch + 0.12: tip = goal.lerp(hover + nrm * 0.04, anim.ease((t - touch - 0.12) / 0.35, 'out'))            # he snatches it back
        A.touch('Right', tuple(tip), tuple(-nrm * 0.80 - east * 0.55 + Vector((0, 0, -0.10))), pole=(east.x * 0.5, east.y * 0.5, -1.0))
    power = anim.curve(t, [(0, 0.30), (1.0, 0.28), (1.6, 0.42), (2.4, 0.3), (3.4, 0.45), (4.6, 0.32), (touch, 0.4), (touch + 0.08, 1.0), (9.0, 1.0)]) + (0.06 * math.sin(t * 9.0) if t > touch else 0.0)
    S.device_power(st.sv, power, light=light, wave=(t - touch) * 26.0 if t >= touch else None)
    A.face(Blink=anim.blinks(t, [0.9, 2.7, 4.4]), BrowUp=anim.curve(t, [(0, 0.0), (touch, 0.1), (touch + 0.15, 0.9), (9, 0.7)]), BrowDown=anim.curve(t, [(0, 0.7), (2.0, 0.45), (touch, 0.2), (touch + 0.1, 0.0)]), JawOpen=anim.curve(t, [(0, 0.35), (2.0, 0.15), (touch, 0.1), (touch + 0.2, 0.3), (9, 0.22)]))
    A.gaze(tuple(dev)); S.mud(0.40, 1.0); S.device_cake(0.0)
    return dev, nrm


class Study(Shot):
    """On the branch at last. He turns his arm over and stares at the thing in it, and then he touches it."""
    name = 's13_study'; dur = 9.0; zone = (2.2, 3.2); bloom = 0.55; move = dict(zoom=(1.0, 1.10), drift=(0.006, 0.008), shake=0.0012)

    def setup(self, st):
        self.K = K = _perch_keys(st); A = st.actor; A.apply(K['b']); A.pin('Seat', K['seat']); head = A.point('Head'); N = st.branch['north']; W = -st.branch['along']; c = K['seat'] + Vector((0, 0, 0.40))
        st.camera(tuple(c + N * 2.25 + W * 0.95 + Vector((0, 0, -0.12))), tuple(c + Vector((0, 0, 0.12))), lens=42, fstop=3.5)
        st.clear_lamps(); st.lamp('Key', tuple(c + N * 2.6 + W * 2.8 + Vector((0, 0, 2.6))), tuple(c), 620, (1.0, 0.86, 0.62), 1.0); st.lamp('Cool', tuple(c - N * 2.2 - W * 1.5 + Vector((0, 0, 1.6))), tuple(c), 420, (0.55, 0.85, 0.95), 1.0)
        st.lamp('Eye', tuple(c + N * 2.2 + W * 0.6 + Vector((0, 0, 0.2))), tuple(head), 8, (0.9, 1.0, 0.95), 0.35); st.splash.frame(-1.0)

    def center(self, st): return (self.K['seat'].x, self.K['seat'].y)
    def frame(self, st, t): _study(st, self.K, t)


class Device(Shot):
    """Insert, over his shoulder: the shattered glass, the scar it sits in, and his finger coming down on it."""
    name = 's14_device'; dur = 3.2; zone = (1.5, 2.2); bloom = 0.7; t0 = 4.4; move = dict(zoom=(1.0, 1.10), drift=(0.0, 0.0), shake=0.0010)

    def setup(self, st):
        self.K = K = _perch_keys(st); A = st.actor; dev, nrm = _study(st, K, 3.5); side = nrm.cross(Vector((0, 0, 1))).normalized()
        st.camera(tuple(dev + nrm * 0.40 + Vector((0, 0, 0.14)) - side * 0.30), tuple(dev + side * 0.012), lens=85, fstop=4.0)
        st.clear_lamps(); st.lamp('Key', tuple(dev + nrm * 0.9 + Vector((0, 0, 1.4)) - side * 1.2), tuple(dev), 34, (1.0, 0.88, 0.66), 0.7); st.lamp('Cool', tuple(dev + side * 1.4 + Vector((0, 0, 0.5))), tuple(dev), 20, (0.6, 0.88, 0.95), 0.8); self.light = 0.45

    def center(self, st): return (self.K['seat'].x, self.K['seat'].y)
    def frame(self, st, t): _study(st, self.K, self.t0 + t, light=0.45)


class Wide(Shot):
    """A long way back: the black wood, the pool, the fallen branch, and on it one small animal bent over a point of blue light."""
    name = 's15_wide'; dur = 5.0; zone = (2.6, 3.6); bloom = 0.6; move = dict(zoom=(1.18, 1.0), drift=(0.0, -0.01), shake=0.0008)

    def setup(self, st):
        self.K = K = _perch_keys(st); c = K['seat']
        st.camera((0.6, 10.2, 0.42), tuple(c + Vector((-0.45, 0, -0.30))), lens=46, fstop=8.0); st.sightline(tuple(c), 0.3, 0.6, 1.0)
        st.clear_lamps(); st.lamp('Rim', tuple(c + Vector((2.5, -3.5, 4.0))), tuple(c), 700, (0.62, 0.88, 0.95), 1.2); st.lamp('Key', tuple(c + Vector((-3.5, 3.5, 3.5))), tuple(c), 380, (1.0, 0.86, 0.62), 1.2)

    def center(self, st): return (self.K['seat'].x, self.K['seat'].y)
    def frame(self, st, t): _study(st, self.K, 7.2 + t * 0.35)


# ------------------------------------------------------------------------------------------------ through his eyes
class Pano(Shot):
    """A panorama plate from where his eyes are; the frames are that plate seen by a camera that turns (project.py)."""
    kind = 'pano'; eye = (0.5, 1.3, 1.0); toward = (0.0, 1.0); lon = (-90.0, 90.0); lat = (-30.0, 50.0); ppd = 16.0; lens = 24.0; fog = True

    def setup(self, st):
        c = st.cam; f = Vector((self.toward[0], self.toward[1], 0)).normalized(); c.location = self.eye; c.rotation_euler = f.to_track_quat('-Z', 'Y').to_euler(); cd = c.data; cd.type = 'PANO'; cd.panorama_type = 'EQUIRECTANGULAR'; cd.dof.use_dof = False
        cd.longitude_min, cd.longitude_max = math.radians(self.lon[0]), math.radians(self.lon[1]); cd.latitude_min, cd.latitude_max = math.radians(self.lat[0]), math.radians(self.lat[1])
        k = st.q['size'][0] / 1280.0; st.sc.render.resolution_x = int((self.lon[1] - self.lon[0]) * self.ppd * k); st.sc.render.resolution_y = int((self.lat[1] - self.lat[0]) * self.ppd * k); st.clear_lamps(); bpy.context.view_layer.update()

    def view(self, t): return dict(yaw=0.0, pitch=0.0, roll=0.0, lens=self.lens)             # where he is looking at time t (degrees from `toward`)


class Look(Pano):
    """ "my eyes started wandering in confusion": rows of trees going off into the dark, vines strung between them, light on the water."""
    name = 's04_look'; dur = 7.5; eye = (BANK[0], BANK[1] - 0.15, 0.16 + 0.78); toward = (-0.35, 0.94); lon = (-112.0, 112.0); lat = (-32.0, 46.0); move = dict(zoom=(1.0, 1.0), drift=(0, 0), shake=0.002)

    def view(self, t):
        yaw = anim.curve(t, [(0.0, -78), (1.3, -60), (1.6, -22), (2.9, -8), (3.2, 34), (4.4, 52), (4.75, 12), (6.2, -4), (7.5, 2)], 'inout'); pitch = anim.curve(t, [(0.0, -6), (1.3, 2), (1.6, 8), (2.9, 14), (3.2, 3), (4.4, -8), (4.75, -14), (6.2, 4), (7.5, 9)], 'inout')
        return dict(yaw=yaw + 1.2 * anim.wobble(t, 3.0, 0.9), pitch=pitch + 0.9 * anim.wobble(t, 5.0, 0.8), roll=2.0 * anim.wobble(t, 7.0, 0.5), lens=24.0)


class Up(Pano):
    """ "Looking up i saw the sun trying to climb through the leaves": and, black across it, the branch."""
    name = 's06_up'; dur = 5.0; eye = (SPOT[0], SPOT[1], -0.37 + 1.27); toward = (-0.50, 0.87); lon = (-62.0, 62.0); lat = (-12.0, 88.0); bloom = 0.9; move = dict(zoom=(1.0, 1.0), drift=(0, 0), shake=0.002)

    def view(self, t):
        yaw = anim.curve(t, [(0.0, 14), (1.6, 0), (3.0, 2), (4.2, 20), (5.0, 24)], 'inout'); pitch = anim.curve(t, [(0.0, 8), (1.6, 33), (3.0, 36), (4.2, 60), (5.0, 63)], 'inout')
        return dict(yaw=yaw + 0.8 * anim.wobble(t, 2.0, 0.9), pitch=pitch + 0.8 * anim.wobble(t, 4.0, 0.8), roll=1.5 * anim.wobble(t, 6.0, 0.5), lens=22.0)


class Wake(Shot):
    """ "i slid my eyes open the grass met up to my eye view": a set of plates from the mud, each focused further off; the frames pull focus through them."""
    name = 's01_wake'; kind = 'focus'; dur = 6.5; focus = (0.14, 0.25, 0.5, 1.2, 4.0, 15.0); lens = 21.0; scale = 1.4; fstop = 1.6; move = dict(zoom=(1.0, 1.0), drift=(0, 0), shake=0.0)

    def setup(self, st, i=0):
        K = _wake_keys(st); A = st.actor; A.apply(K['prone']); bpy.context.view_layer.update(); eye = A.point('Eyes'); self.pos = eye + Vector((-0.05, 0.0, 0.02))
        st.camera(tuple(self.pos), tuple(self.pos + Vector((-1.0, -0.12, 0.20))), lens=self.lens / self.scale, fstop=self.fstop, focus=self.focus[i]); st.cam.data.dof.aperture_blades = 0
        st.sc.render.resolution_x = int(st.q['size'][0] * self.scale); st.sc.render.resolution_y = int(st.q['size'][1] * self.scale * 1.5); st.cam.data.sensor_fit = 'HORIZONTAL'; st.clear_lamps()

    def view(self, t):
        f = anim.curve(t, [(0.0, 0.0), (1.4, 0.0), (2.4, 0.6), (3.2, 0.2), (4.6, 3.6), (5.6, 5.0), (6.5, 4.6)], 'inout')                    # which plate (fractional = between two)
        return dict(yaw=1.2 * anim.wobble(t, 1.0, 0.6), pitch=1.0 * anim.wobble(t, 2.0, 0.5), roll=anim.curve(t, [(0, 28), (4.5, 26), (6.5, 14)]), lens=self.lens, focus=f)


SHOTS = {s.name: s for s in (Wake(), Eyes(), Rise(), Look(), Stand(), Up(), Jump(), Arm(), Fall(), Pull(), Study(), Device(), Wide())}
ORDER = ['s01_wake', 's02_eyes', 's03_rise', 's04_look', 's05_stand', 's06_up', 's07_jump', 's08_arm', 's09_fall', 's12_pull', 's13_study', 's14_device', 's15_wide']

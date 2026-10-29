"""Episode 1, scene 1 — THE LAB (Ash's Oct 25 rewrite: the lab comes first). Opens on his eyes in white light. SUBJECT 7 squats on
a stool at the steel table; two scientists run him through the day's tests — picture cards (fishing, fire, the wheel), the
puzzle blocks, the newspaper. Things keep going wrong for the people and he hears every word of it ("…Fuck.", "Oh, fuck you.").
Then the needle. He panics, wrecks the table, slams his arm down: the device cracks, the room goes white, and he is gone.

Set: lab.py (table at (0, 0.6), screen at its far edge). He sits on a stool on the near side facing +Y; Dr A (scientist_a) stands
at the table's right end, Dr B (scientist_b) works at his left. What the lab is FOR stays a mystery (STORY.md).

    python ep1_lab.py <out folder> [--quality anim|draft|laptop|hd|film] [--only B01,B02] [--step 1]
"""
import math, os, sys, time
import bpy
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anim, behavior as B, director as D, lab, seven as S
from ep1_troop import Shot, says

FPS = 24
CAST = ['seven', 'scientist_a', 'scientist_b']
STOOL = (0.0, -0.32); STOOL_TOP = 0.50; DRA = (1.15, 0.25); DRB = (-1.05, -0.25); DOOR = (-3.5, -3.0)


def clean(): S.mud(0.0, 0.0)


# ------------------------------------------------------------------------------------------------ props
class Props:
    def __init__(self, st):
        L = st.set; coll = st.sc.collection; steel = bpy.data.materials.get('LabSteel')
        self.stool = [lab._box('StoolTop', (0.40, 0.40, 0.04), (STOOL[0], STOOL[1], STOOL_TOP - 0.02), steel, coll)] + [lab._box(f'StoolLeg{i}', (0.03, 0.03, STOOL_TOP - 0.04), (STOOL[0] + dx, STOOL[1] + dy, (STOOL_TOP - 0.04) / 2), steel, coll) for i, (dx, dy) in enumerate(((-0.17, -0.17), (0.17, -0.17), (0.17, 0.17), (-0.17, 0.17)))]
        self.cards = {'fishing': L['card']}
        for k in ('fire', 'wheel'): self.cards[k] = lab._plane(f'Card_{k}', 0.30, 0.21, (0.0, 3.0, -5.0), (0, 0, 0), lab._mat(f'Card_{k}', '#ffffff', 0.6, image=lab.card_image(k)), coll)
        for c in self.cards.values(): c['home'] = tuple(c.location); c['rot'] = tuple(c.rotation_euler)
        self.blocks = L['puzzle']; self.block_home = [Vector(b.location) for b in self.blocks]; self.tray = L['tray']; self.tray_home = Vector(self.tray.location); self.paper = L['paper']; self.paper_home = Vector(self.paper.location)
        self.screen = L['screen']; self.back = bpy.data.objects.get('ScreenBack'); at = Vector((1.35, 1.25, 1.30)); n = (Vector((STOOL[0], STOOL[1], 0)) - Vector((at.x, at.y, 0))).normalized()
        th = math.atan2(-n.x, -n.y); self.screen.location = at; self.screen.rotation_euler = (math.radians(86), 0, -th)                        # on a stand by the table's far corner, turned to him
        if self.back: self.back.location = at - n * 0.025; self.back.rotation_euler = (math.radians(-4), 0, -th)
        self.screen_home = (Vector(self.screen.location), tuple(self.screen.rotation_euler)); self.back_home = (Vector(self.back.location), tuple(self.back.rotation_euler)) if self.back else None
        n = bpy.data.meshes.new('Needle'); import bmesh; bm_ = bmesh.new(); bmesh.ops.create_cone(bm_, cap_ends=True, segments=12, radius1=0.012, radius2=0.012, depth=0.11); bm_.to_mesh(n); bm_.free()
        n.materials.append(lab._mat('Syringe', '#dfe8ee', 0.1)); self.needle = bpy.data.objects.new('Needle', n); coll.objects.link(self.needle); self.needle.hide_render = True
        self.alarm = st.lamp('Alarm', (0.0, 0.0, 3.0), (0.0, 0.0, 0.0), 0.0, (1.0, 0.08, 0.05), 3.0, only_troop=False); st.lamps.remove(self.alarm)   # survives clear_lamps

    def reset(self):
        for c in self.cards.values(): c.location = c['home']; c.rotation_euler = c['rot']
        for b, h in zip(self.blocks, self.block_home): b.location = h; b.rotation_euler = (0, 0, 0)
        self.tray.location = self.tray_home; self.tray.rotation_euler = (0, 0, 0); self.paper.location = self.paper_home
        self.screen.location, self.screen.rotation_euler = self.screen_home[0], self.screen_home[1]
        if self.back: self.back.location, self.back.rotation_euler = self.back_home[0], self.back_home[1]
        self.needle.hide_render = True; self.alarm.data.energy = 0.0

    def in_hand(self, obj, A, side='Right', up=0.04, tilt=(math.radians(75), 0, 0)):
        """Hold a flat thing (a card) up at that hand, its face toward where the person faces."""
        bpy.context.view_layer.update(); p = A.point(side + 'Palm'); obj.location = p + Vector((0, 0, up)); h = A.arm.rotation_euler.z; obj.rotation_euler = (tilt[0], 0, h)


def props(st):
    if not getattr(st, 'lp', None): st.lp = Props(st)
    return st.lp


# ------------------------------------------------------------------------------------------------ blocking
def seated(st, keys=None):
    """Seven squatting on the stool, facing the table; Dr A at the table's right end, Dr B standing at his left."""
    h = st.heading_to; seat = (STOOL[0], STOOL[1], STOOL_TOP + 0.12); k = {
        'seven': st.actors['seven'].key('sit', root=STOOL, heading=h(STOOL, (0.0, 1.0)), pin=(['Seat'], seat)),
        'scientist_a': st.key('scientist_a', 'upright', DRA, h(DRA, STOOL), sink=0.0),
        'scientist_b': st.key('scientist_b', 'upright', DRB, h(DRB, STOOL), sink=0.0)}
    k.update(keys or {}); return st.pose_all(k)


def everyone(st, K, t, skip=()):
    for w in CAST:
        if w in skip: continue
        A = st.actors[w]; A.apply(K[w]); A.alive(t + len(w), restless=0.3 if w != 'seven' else 0.6); A.face(Blink=anim.blinks(t, [1.1 + len(w) * 0.37, 3.9 + len(w) * 0.21]))


def bright(st, stops=0.0): st.sc.view_settings.exposure = stops


class Lab(Shot):
    place = 'lab'
    def base(self, st, K):
        self.K = K; self.pr = props(st); self.pr.reset(); bright(st); everyone(st, K, 0); clean(); S.device_power(st.actors['seven'].sv, 0.9)
    def light(self, st, who, k=1.0):
        st.clear_lamps(); st.lamp('LabKey', (0.0, -2.5, 2.6), (0.0, 0.3, 1.0), 700 * k, (1.0, 1.0, 1.0), 2.5, only_troop=False); st.rig(who, key=(1.0, 0.98, 0.95), fill=(0.85, 0.92, 1.0), k=0.5 * k)


def device_on(st, t, base=0.9):
    """In the lab the device works: steady light, a slow pulse running out along the lines under his skin."""
    S.device_power(st.actors['seven'].sv, base, wave=(t * 3.0) % 8.0)


def talker(st, who, t, lines, base=None):
    A = st.actors[who]; A.face(**says(st, who, t, lines, dict(base or {}, Blink=anim.blinks(t, [1.7 + len(who) * 0.3])), kind='word'))


NEUTRAL = dict(Blink=0.0, JawOpen=0.0, Pout=0.0, Grin=0.0, BrowUp=0.0, BrowDown=0.0, LipF=0.0)


def full(*faces):
    """Every face shape set (a shape left out keeps last frame's value), the given ones laid over neutral."""
    return B.mix(NEUTRAL, *faces)


def door(st):
    """The steel door at the far end of the room, a small square of daylight in its window (made once)."""
    if not bpy.data.objects.get('LabDoor'):
        coll = st.sc.collection
        lab._box('LabDoor', (1.1, 0.06, 2.2), (-2.6, -4.96, 1.1), lab._mat('DoorSteel', '#b9c1c6', 0.35, metal=0.6), coll); lab._box('DoorWindow', (0.32, 0.07, 0.32), (-2.6, -4.95, 1.65), lab._mat('DoorDay', '#fff6dc', 0.1, emit=6.0), coll)


def head_scratch(st, who, t, amount, side='Right'):
    """One hand up at the back of the head, fingers raking (amount 0..1 brings it up from where the pose left it)."""
    if amount <= 0.01: return
    A = st.actors[who]; f = st.face_dir(who); k = A.sv['spec']['scale']; s = Vector((-f.y, f.x, 0)) * (1 if side == 'Left' else -1)
    rest = A.point(side + 'Hand'); spot = A.point('Head') - f * 0.07 * k + Vector((0, 0, 0.13 * k)) + s * 0.05 * k + Vector((0, 0, 0.02 * k * math.sin(2 * math.pi * 4.0 * t)))
    A.reach(side, tuple(rest.lerp(spot, amount)), tuple(s + Vector((0, 0, 0.6)))); bpy.context.view_layer.update()


# ================================================================================================ the shots
class B01(Lab):
    """Black. Then his eyes open, very close, and white light floods in."""
    dur = 5.0
    def setup(self, st): self.base(st, seated(st)); self.light(st, 'seven'); st.frame_on('seven', 'extreme', angle=0, up=0, fstop=2.0)
    def frame(self, st, t):
        A = st.actors['seven']; A.apply(self.K['seven']); A.alive(t, restless=0.1); A.gaze_dir(anim.curve(t, [(2.6, 0), (3.2, 12), (4.0, -8)]), 3)
        A.face(Blink=anim.curve(t, [(0.0, 1.0), (1.8, 1.0), (2.3, 0.0)]), BrowUp=anim.curve(t, [(2.2, 0), (2.8, 0.5)])); bright(st, anim.curve(t, [(0, -8.0), (1.8, -8.0), (2.6, 1.2), (4.0, 0.4)])); device_on(st, t)


class B02(Lab):
    """Wide: the white room. A chimp on a stool at a steel table; two people in white coats; a screen: SUBJECT 7."""
    dur = 6.5; lines = [(1.2, 'scientist_a', "Session four-twelve. Subject seven. Recall testing."), (4.4, 'scientist_b', "He's awake.")]
    def setup(self, st): self.base(st, seated(st)); self.light(st, 'seven', 0.8)
    def frame(self, st, t):
        u = t / self.dur; st.camera((-2.6 + 0.8 * u, -3.4 + 0.6 * u, 1.9), (0.0, 0.3, 0.95), lens=26, fstop=8.0); everyone(st, self.K, t)
        talker(st, 'scientist_a', t, self.lines); talker(st, 'scientist_b', t, self.lines); device_on(st, t)


class CardShot(Lab):
    """Dr A holds a picture card up in front of him."""
    kind = 'fishing'; react = 'tap'
    def setup(self, st):
        self.base(st, seated(st)); self.k_hold = st.key('scientist_a', 'upright', (DRA[0] - 0.35, DRA[1] - 0.2), st.heading_to((DRA[0] - 0.35, DRA[1] - 0.2), STOOL), sink=0.0)
        self.k_reach = st.actors['seven'].key('reach', root=STOOL, heading=st.heading_to(STOOL, (0.0, 1.0)), pin=(['Seat'], (STOOL[0], STOOL[1], STOOL_TOP + 0.12)))
        st.pose_all(self.K); st.actors['scientist_a'].apply(self.k_hold); st.group(['seven', 'scientist_a'], angle=-70, up=6, lens=40, margin=1.2); self.light(st, 'seven')
    def frame(self, st, t):
        A = st.actors['scientist_a']; A.apply(self.k_hold); A.alive(t, restless=0.3); bpy.context.view_layer.update(); S7 = st.actors['seven']
        card_at = S7.point('Eyes') + (A.point('Eyes') - S7.point('Eyes')).normalized() * 0.42 + Vector((0, 0, -0.10)); A.reach('Right', tuple(card_at + Vector((0.0, 0.0, -0.08))), (1, 0, -1))
        self.pr.in_hand(self.pr.cards[self.kind], A); A.gaze(tuple(S7.point('Eyes'))); talker(st, 'scientist_a', t, self.lines)
        w = anim.curve(t, self.reach_curve) if self.react else 0.0; S7.apply(anim.Track([(0, self.K['seven']), (1, self.k_reach)], S7).at(w)); S7.alive(t, restless=0.3)
        if w > 0.6: S7.touch('Right', tuple(self.pr.cards[self.kind].location), tuple((self.pr.cards[self.kind].location - S7.point('RightHand')).normalized()))
        S7.gaze(tuple(self.pr.cards[self.kind].location)); S7.face(Blink=anim.blinks(t, [1.4]), BrowUp=0.3, Pout=0.2 * w); everyone(st, self.K, t, skip=('scientist_a', 'seven')); device_on(st, t)


class B03(CardShot):
    """The fishing card. He looks at it a long time, then taps the little man's rod."""
    dur = 6.0; kind = 'fishing'; reach_curve = [(2.6, 0), (3.6, 1), (4.6, 1), (5.4, 0)]; lines = [(0.4, 'scientist_a', "This one. What's he doing, Seven?"), (4.0, 'scientist_a', "Good. That's right.")]


class B04(CardShot):
    """The fire card. He reaches for the flame — Dr A pulls it back."""
    dur = 5.5; kind = 'fire'; reach_curve = [(1.4, 0), (2.4, 1), (2.7, 0.2)]; lines = [(0.3, 'scientist_a', "Fire."), (2.3, 'scientist_a', "Hot. Hot, Seven. No.")]


class B05(CardShot):
    """The wheel card. He tilts his head at it."""
    dur = 4.0; kind = 'wheel'; react = None; reach_curve = [(0, 0)]; lines = [(0.4, 'scientist_a', "And this one?")]
    def frame(self, st, t):
        super().frame(st, t); S7 = st.actors['seven']; pb = S7.arm.pose.bones['Head']; from mathutils import Quaternion
        ax = pb.bone.matrix_local.to_3x3().inverted() @ Vector((0, 1, 0)); pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(ax.normalized(), math.radians(anim.curve(t, [(1.0, 0), (1.8, 18)])))


class B06(Lab):
    """The puzzle: he stacks the coloured blocks one on another, fast. Dr B times him."""
    dur = 7.0; lines = [(4.6, 'scientist_b', "Eleven seconds. Faster than yesterday.")]
    def setup(self, st):
        self.base(st, seated(st)); self.k_lean = st.actors['seven'].key('reach', root=STOOL, heading=st.heading_to(STOOL, (0.0, 1.0)), pin=(['Seat'], (STOOL[0], STOOL[1], STOOL_TOP + 0.12)), tweak={'Spine2': (0, -0.55, 0.83)})
        self.base_pt = Vector((0.0, 0.42, 0.80)); st.pose_all(self.K); st.medium('seven', angle=45, up=14, lens=45); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.k_lean); S7.alive(t, restless=0.4); n = len(self.pr.blocks); T = 0.75
        for i, b in enumerate(self.pr.blocks):
            u = anim.curve(t, [(0.5 + i * T, 0), (0.5 + i * T + 0.5, 1)]); dst = self.base_pt + Vector((0, 0, 0.035 + 0.07 * i)); src = self.pr.block_home[i]
            b.location = src.lerp(dst, u) + Vector((0, 0, 0.12 * math.sin(math.pi * u))); b.rotation_euler = (0, 0, 0.3 * (1 - u))
            if 0.5 + i * T <= t < 0.5 + (i + 1) * T: S7.reach('Right' if i % 2 else 'Left', tuple(b.location + Vector((0, 0, 0.06))), (0, 0, -1))
        top = self.pr.blocks[min(n - 1, int(max(0, t - 0.5) / T))].location; S7.gaze(tuple(top)); S7.face(Pout=0.3, BrowDown=0.3, Blink=anim.blinks(t, [3.3]))
        everyone(st, self.K, t, skip=('seven',)); talker(st, 'scientist_b', t, self.lines); device_on(st, t, 1.0)


class B07(Lab):
    """The screen, close: SUBJECT 7, the trace climbing."""
    dur = 3.0
    def setup(self, st): self.base(st, seated(st)); s = self.pr.screen.location; st.camera((s.x + 0.25, s.y - 0.9, s.z + 0.05), tuple(s), lens=50, fstop=2.8); self.light(st, 'seven')
    def frame(self, st, t): everyone(st, self.K, t); device_on(st, t)


class B08(Lab):
    """Dr A, flat: good, again. Seven's face says he is bored of being good."""
    dur = 4.0; lines = [(0.3, 'scientist_a', "Good. Again.")]
    def setup(self, st): self.base(st, seated(st)); st.close('seven', angle=10, up=0, lens=85); self.light(st, 'seven')
    def frame(self, st, t):
        everyone(st, self.K, t); talker(st, 'scientist_a', t, self.lines); S7 = st.actors['seven']; S7.gaze(tuple(st.actors['scientist_a'].point('Eyes')))
        S7.face(BrowDown=anim.curve(t, [(1.0, 0), (1.8, 0.5)]), Pout=anim.curve(t, [(1.4, 0), (2.0, 0.5)]), Blink=anim.blinks(t, [2.4, 2.75])); device_on(st, t)


class B09(Lab):
    """The newspaper slid across to him. He stares at the blurred headline, then lifts it and smells it."""
    dur = 6.0; lines = [(2.6, 'scientist_b', "He's reading it."), (4.4, 'scientist_a', "He's smelling it.")]
    def setup(self, st):
        self.base(st, seated(st)); self.k_lift = st.actors['seven'].key('eat', root=STOOL, heading=st.heading_to(STOOL, (0.0, 1.0)), pin=(['Seat'], (STOOL[0], STOOL[1], STOOL_TOP + 0.12)))
        st.pose_all(self.K); st.medium('seven', angle=30, up=6, lens=55); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; w = anim.curve(t, [(3.2, 0), (4.0, 1)]); S7.apply(anim.Track([(0, self.K['seven']), (1, self.k_lift)], S7).at(w)); S7.alive(t, restless=0.3); bpy.context.view_layer.update()
        slide = anim.curve(t, [(0.2, 0), (1.2, 1)]); on_table = self.pr.paper_home.lerp(Vector((0.0, 0.40, 0.805)), slide)
        self.pr.paper.location = on_table.lerp(S7.mouth() + Vector((0, 0.05, -0.05)), w); self.pr.paper.rotation_euler = (math.radians(70) * w, 0, 0.18 * (1 - slide))
        S7.gaze(tuple(self.pr.paper.location)); S7.face(Pout=0.4 * w, BrowUp=0.3, Blink=anim.blinks(t, [2.0]) if w < 0.5 else 0.6)
        everyone(st, self.K, t, skip=('seven',)); talker(st, 'scientist_a', t, self.lines); talker(st, 'scientist_b', t, self.lines); device_on(st, t)


class B10(Lab):
    """Dr B carries the tray of blocks past — it tips, the blocks and the tray hit the floor. One word."""
    dur = 5.5; lines = [(2.4, 'scientist_b', "…Fuck.")]
    def setup(self, st):
        self.base(st, seated(st)); B = st.actors['scientist_b']; a, b = (DRB[0] + 0.2, 0.15), (DRB[0] + 1.2, -1.1)
        self.k1 = st.key('scientist_b', 'carry', a, st.heading_to(a, b), sink=0.0); self.k2 = st.key('scientist_b', 'carry', b, st.heading_to(a, b), sink=0.0)
        self.k3 = st.key('scientist_b', 'upright', b, st.heading_to(a, b), sink=0.0, tweak={'Neck': (0, -0.35, 0.94), 'Head': (0, -0.55, 0.83)})
        self.walk = anim.Track([(0, self.k1), (1.6, self.k2), (2.2, self.k3, 'out'), (5.5, self.k3)], B); st.pose_all(self.K)
        st.camera((-2.7, -1.9, 1.25), (-0.45, -0.55, 0.65), lens=30, fstop=4.0); self.light(st, 'scientist_b')
    def frame(self, st, t):
        B = st.actors['scientist_b']; B.apply(self.walk.at(t)); B.alive(t, restless=0.6); bpy.context.view_layer.update(); g = 9.8
        if t < 1.6:
            mid = (B.point('LeftPalm') + B.point('RightPalm')) / 2 + Vector((0, 0, 0.03)); self.pr.tray.location = mid; self.drop0 = Vector(mid)
            for i, bl in enumerate(self.pr.blocks): bl.location = mid + Vector((-0.12 + 0.09 * (i % 3), -0.05 + 0.09 * (i // 3), 0.045))
            self.b0 = [Vector(bl.location) for bl in self.pr.blocks]
        else:
            s = t - 1.6; self.pr.tray.location = (self.drop0.x + 0.2 * s, self.drop0.y - 0.3 * s, max(0.012, self.drop0.z - 0.5 * g * s * s)); self.pr.tray.rotation_euler = (min(1.2, 3 * s) if self.pr.tray.location.z > 0.012 else 0.05, 0, 0)
            for i, (bl, b0) in enumerate(zip(self.pr.blocks, self.b0)):
                s_ = max(0.0, s - 0.03 * i); bl.location = (b0.x + (i % 3 - 1) * 0.5 * s_, b0.y - 0.4 * s_, max(0.035, b0.z + 0.8 * s_ - 0.5 * g * s_ * s_)); bl.rotation_euler = (5 * s_, 4 * s_, 3 * s_ * i)
        talker(st, 'scientist_b', t, self.lines, dict(BrowDown=0.8 if t > 2.0 else 0.0)); B.gaze(tuple(Vector(self.pr.tray.location)))
        S7 = st.actors['seven']; S7.apply(self.K['seven']); S7.alive(t, restless=0.4); S7.gaze(tuple(B.point('Eyes'))); S7.face(BrowUp=anim.curve(t, [(1.7, 0), (1.9, 0.9)]), Blink=anim.blinks(t, [1.65]))
        everyone(st, self.K, t, skip=('seven', 'scientist_b')); device_on(st, t)


class B11(Lab):
    """Close on Seven: his lips move. No sound. Trying the shape of what he heard."""
    dur = 3.5
    def setup(self, st): self.base(st, seated(st)); st.close('seven', angle=-15, up=0, lens=95); self.light(st, 'seven')
    def frame(self, st, t):
        everyone(st, self.K, t); S7 = st.actors['seven']; S7.gaze(tuple(st.actors['scientist_b'].point('Eyes')))
        S7.face(LipF=anim.curve(t, [(1.0, 0), (1.2, 0.6), (1.4, 0)]), JawOpen=anim.curve(t, [(1.35, 0), (1.5, 0.12), (1.7, 0)]), Blink=anim.blinks(t, [2.6])); device_on(st, t)


class B12(Lab):
    """The screen glitches and dies. Dr A smacks the side of it."""
    dur = 5.0; lines = [(0.6, 'scientist_a', "No, no, no—"), (2.6, 'scientist_a', "Oh, fuck you.")]
    def setup(self, st):
        self.base(st, seated(st)); at = (0.55, 1.35); self.k = st.key('scientist_a', 'upright', at, st.heading_to(at, (0.0, 1.0)), sink=0.0); st.pose_all(self.K)
        s = self.pr.screen.location; st.camera((s.x - 0.9, s.y - 1.6, 1.45), (s.x + 0.3, s.y, 1.25), lens=40, fstop=4.0); self.light(st, 'scientist_a')
    def frame(self, st, t):
        A = st.actors['scientist_a']; A.apply(self.k); A.alive(t, restless=0.8); bpy.context.view_layer.update(); hit = anim.curve(t, [(2.0, 0), (2.25, 1), (2.45, 0)])
        A.reach('Right', tuple(self.pr.screen.location + Vector((0.55 - 0.05 * hit, 0.02, 0.05))), (1, 0, -1)); A.gaze(tuple(self.pr.screen.location)); talker(st, 'scientist_a', t, self.lines, dict(BrowDown=0.9))
        flick = 1.0 if t < 0.5 else (0.5 + 0.5 * math.sin(40 * t)) * anim.curve(t, [(0.5, 1), (1.8, 0)])
        mat = bpy.data.materials['ScreenImg']; mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.5 * flick
        everyone(st, self.K, t, skip=('scientist_a',)); device_on(st, t)
    def done(self, st): bpy.data.materials['ScreenImg'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.5


class B13(Lab):
    """Seven, very interested in that one."""
    dur = 3.0
    def setup(self, st): self.base(st, seated(st)); st.close('seven', angle=20, up=0, lens=90); self.light(st, 'seven')
    def frame(self, st, t):
        everyone(st, self.K, t); S7 = st.actors['seven']; S7.gaze(tuple(Vector((0.55, 1.35, 1.6)))); S7.face(BrowUp=0.6, LipF=anim.curve(t, [(1.4, 0), (1.55, 0.5), (1.7, 0)]), Blink=anim.blinks(t, [2.4])); device_on(st, t)


class B14(Lab):
    """Dr B comes at him with a syringe, Dr A behind to hold him. Easy. Easy."""
    dur = 6.0; lines = [(0.6, 'scientist_b', "Okay. Hold him."), (3.0, 'scientist_a', "Easy, Seven. Easy. Little scratch.")]
    def setup(self, st):
        K = seated(st); a = (STOOL[0] - 0.55, STOOL[1] + 0.05); self.kb = st.key('scientist_b', 'upright', a, st.heading_to(a, STOOL), sink=0.0); b = (STOOL[0] + 0.5, STOOL[1] - 0.45); self.ka = st.key('scientist_a', 'upright', b, st.heading_to(b, STOOL), sink=0.0)
        self.base(st, K); st.pose_all({'scientist_a': self.ka, 'scientist_b': self.kb, 'seven': K['seven']}); st.group(['seven', 'scientist_b'], angle=160, up=8, lens=35, margin=1.4); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.K['seven']); S7.alive(t, breath=1.0 + 0.4 * t, rate=0.4 + 0.1 * t, restless=0.5 + 0.4 * t); bpy.context.view_layer.update(); arm = S7.point('LeftForeArm').lerp(S7.point('LeftHand'), 0.3)
        B = st.actors['scientist_b']; B.apply(self.kb); B.alive(t, restless=0.3); w = anim.curve(t, [(1.0, 0), (4.5, 0.85)]); tip = B.point('RightHand').lerp(arm + Vector((0, 0, 0.08)), w)
        B.reach('Right', tuple(tip), (0, -1, -1)); bpy.context.view_layer.update(); self.pr.needle.hide_render = False; self.pr.needle.location = B.point('RightPalm'); d = (arm - B.point('RightPalm')).normalized(); self.pr.needle.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        A = st.actors['scientist_a']; A.apply(self.ka); A.alive(t, restless=0.3); A.reach('Left', tuple(S7.point('LeftArm') + Vector((0, 0, 0.05))), (0, 0, -1)); A.reach('Right', tuple(S7.point('RightArm') + Vector((0, 0, 0.05))), (0, 0, -1))
        talker(st, 'scientist_b', t, self.lines); talker(st, 'scientist_a', t, self.lines); S7.gaze(tuple(self.pr.needle.location)); S7.face(BrowUp=1.0, Grin=anim.curve(t, [(2.0, 0), (5.0, 0.6)]), Blink=0.0); device_on(st, t, 0.9 + 0.1 * math.sin(6 * t))


class B15(Lab):
    """His eyes on the needle. The device flares red-white; somewhere an alarm starts."""
    dur = 2.5
    def setup(self, st): self.base(st, seated(st)); st.frame_on('seven', 'extreme', angle=5, up=0, fstop=2.0); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.K['seven']); S7.alive(t, breath=2.5, rate=1.0, restless=1.5); S7.gaze_dir(-15, -20); S7.face(BrowUp=1.0, Grin=0.7, Blink=0.0)
        self.pr.alarm.data.energy = 400.0 * (0.5 + 0.5 * math.sin(2 * math.pi * 2.0 * t)) * (t > 0.8); device_on(st, t, 1.0)


def panic_keys(st):
    h = st.heading_to(STOOL, (0.0, 1.0)); top = (STOOL[0], STOOL[1] + 0.45)
    return dict(display=st.actors['seven'].key('display', root=top, heading=h, z=0.80 - 0.02), crouch=st.actors['seven'].key('crouch', root=top, heading=h, z=0.80 + 0.05))


class B16(Lab):
    """He explodes: up onto the table, screaming, arms wide. The people stumble back."""
    dur = 4.0; lines = [(1.0, 'scientist_a', "Shit — shit! Get back!")]
    def setup(self, st):
        K = seated(st); self.base(st, K); P = panic_keys(st); S7 = st.actors['seven']; self.track = anim.Track([(0, K['seven']), (0.3, P['crouch'], 'out'), (0.7, P['display'], 'out'), (4.0, P['display'])], S7)
        self.backs = {w: anim.Track([(0, K[w]), (0.5, st.key(w, 'upright', (K[w]['loc'].x * 1.6, K[w]['loc'].y - 0.6), K[w]['heading'], sink=0.0), 'out')], st.actors[w]) for w in ('scientist_a', 'scientist_b')}
        st.pose_all(K); st.camera((1.9, -3.0, 1.1), (0.0, 0.2, 1.65), lens=24, fstop=5.6); self.light(st, 'seven', 1.2)
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.track.at(t)); S7.alive(t, breath=3.0, rate=1.2, restless=3.0); S7.face(Grin=1.0, JawOpen=anim.curve(t, [(0.4, 0), (0.7, 0.9)]), BrowDown=1.0)
        for w, tr in self.backs.items(): A = st.actors[w]; A.apply(tr.at(t)); A.alive(t, restless=1.5); A.gaze(tuple(S7.point('Eyes'))); talker(st, w, t, self.lines, dict(BrowUp=1.0))
        self.pr.alarm.data.energy = 400.0 * (0.5 + 0.5 * math.sin(2 * math.pi * 2.0 * t)); device_on(st, t, 1.0); self.pr.needle.hide_render = True


class B17(Lab):
    """He wrecks it: sweeps the blocks off, kicks the screen over, the tray flying."""
    dur = 3.5
    def setup(self, st):
        self.base(st, seated(st)); P = panic_keys(st); self.k = P['display']; self.k2 = P['crouch']; st.pose_all(self.K); st.camera((-2.3, 3.1, 1.9), (0.0, 0.45, 1.55), lens=24, fstop=5.6); self.light(st, 'seven', 1.2)
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(anim.Track([(0, self.k), (0.6, self.k2, 'in'), (1.2, self.k, 'out'), (3.5, self.k2)], S7).at(t)); S7.alive(t, breath=3.0, rate=1.2, restless=3.0); S7.face(Grin=1.0, JawOpen=0.8, BrowDown=1.0)
        for i, (b, h) in enumerate(zip(self.pr.blocks, self.pr.block_home)):
            s = max(0.0, t - 0.5 - 0.05 * i); b.location = (h.x + (1.5 + 0.3 * i) * s * (1 if i % 2 else -1), h.y + 0.8 * s, max(0.035, h.z + 2.0 * s - 4.9 * s * s)); b.rotation_euler = (6 * s, 5 * s, 4 * s)
        f = anim.curve(t, [(1.1, 0), (1.6, 1)], 'in'); x, rot = self.pr.screen_home; self.pr.screen.rotation_euler = (rot[0] - 1.35 * f, rot[1], rot[2]); self.pr.screen.location = x + Vector((0, 0.25 * f, -0.30 * f))
        if self.pr.back: bl, br = self.pr.back_home; self.pr.back.rotation_euler = (br[0] - 1.35 * f, br[1], br[2]); self.pr.back.location = bl + Vector((0, 0.25 * f, -0.30 * f))
        s = max(0.0, t - 0.9); self.pr.tray.location = (self.pr.tray_home.x - 1.6 * s, self.pr.tray_home.y - 0.5 * s, max(0.012, self.pr.tray_home.z + 2.5 * s - 4.9 * s * s)); self.pr.tray.rotation_euler = (3 * s, 7 * s, 0)
        for w in ('scientist_a', 'scientist_b'): A = st.actors[w]; A.apply(self.K[w]); A.arm.location = A.arm.location + Vector((0, -0.8, 0))
        self.pr.alarm.data.energy = 400.0 * (0.5 + 0.5 * math.sin(2 * math.pi * 2.0 * t)); device_on(st, t, 1.0)


class B18(Lab):
    """He brings his left arm down on the edge of the steel table with everything he has. Macro: the glass cracks; sparks."""
    dur = 3.0
    def setup(self, st):
        self.base(st, seated(st)); P = panic_keys(st); self.k = P['crouch']; S7 = st.actors['seven']; S7.apply(self.k); bpy.context.view_layer.update(); self.edge = Vector((S7.point('LeftHand').x, 0.15, 0.80))
        c, n = S7.device(); st.camera(tuple(c + n * 0.35 + Vector((0.2, -0.2, 0.1))), tuple(c), lens=70, fstop=2.8); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.k); S7.alive(t, restless=2.0); bpy.context.view_layer.update(); up = S7.point('LeftArm') + Vector((0, 0.1, 0.35)); w = anim.curve(t, [(0.2, 0), (0.6, 1)], 'in')
        S7.reach('Left', tuple(up.lerp(self.edge + Vector((0, 0, 0.06)), w)), (1, 0, 0)); c, n = S7.device(); st.camera(tuple(c + n * 0.35 + Vector((0.2, -0.2, 0.1))), tuple(c), lens=70, fstop=2.8)
        spark = (t > 0.6) * abs(math.sin(55 * t)) * anim.curve(t, [(0.6, 1.0), (3.0, 0.3)]); S7.face(Grin=1.0, JawOpen=0.6); S7.sv['glow'].data.color = (1.0, 0.9, 0.7) if spark > 0.5 else (0.20, 0.55, 1.0)
        S7.sv['glow'].data.energy = 1.3 + 40.0 * spark; self.pr.alarm.data.energy = 400.0 * (0.5 + 0.5 * math.sin(2 * math.pi * 2.0 * t))
    def done(self, st): st.actors['seven'].sv['glow'].data.color = (0.20, 0.55, 1.0)


class B19(Lab):
    """The device surges: cold blue light floods the room, brighter, brighter, until there is nothing but white."""
    dur = 3.0
    def setup(self, st):
        self.base(st, seated(st)); P = panic_keys(st); self.k = P['crouch']; st.pose_all(self.K); st.camera((1.9, -2.6, 1.6), (0.0, 0.3, 1.0), lens=24, fstop=8.0); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.k); S7.alive(t, restless=1.0); S7.face(Grin=0.6, JawOpen=0.4, BrowUp=1.0)
        for w in ('scientist_a', 'scientist_b'): A = st.actors[w]; A.apply(self.K[w]); A.arm.location = A.arm.location + Vector((0, -0.8, 0)); A.face(BrowUp=1.0, JawOpen=0.4)
        S7.sv['glow'].data.energy = 1.3 + 3000.0 * anim.curve(t, [(0.2, 0), (2.4, 1)], 'in'); S7.sv['glow'].data.spread = math.radians(180); bright(st, anim.curve(t, [(1.4, 0), (2.8, 7.0)], 'in')); S.device_power(S7.sv, 1.0, wave=6.0 * t)
    def done(self, st): st.actors['seven'].sv['glow'].data.energy = 1.3


class B20(Lab):
    """White fading back to the room: the stool empty, the blocks on the floor, the two of them staring at nothing."""
    dur = 6.0; lines = [(2.6, 'scientist_a', "…Where is he?"), (4.6, 'scientist_b', "…Fuck.")]
    def setup(self, st):
        self.base(st, seated(st)); S7 = st.actors['seven']
        for o in S7.sv['collection'].objects: o.hide_render = True
        for i, b in enumerate(self.pr.blocks): b.location = (-1.2 + 0.5 * i, -0.4 - 0.3 * (i % 2), 0.035); b.rotation_euler = (0, 0, 0.8 * i)
        self.pr.tray.location = (-1.1, -0.9, 0.012); x, rot = self.pr.screen_home; self.pr.screen.rotation_euler = (rot[0] - 1.35, rot[1], rot[2]); self.pr.screen.location = x + Vector((0, 0.25, -0.30))
        for w, at in (('scientist_a', (0.9, -0.9)), ('scientist_b', (-0.9, -1.0))): self.K[w] = st.key(w, 'upright', at, st.heading_to(at, STOOL), sink=0.0)
        st.camera((0.0, -3.2, 1.55), (0.0, -0.2, 0.75), lens=30, fstop=8.0); self.light(st, 'scientist_a')
    def frame(self, st, t):
        bright(st, anim.curve(t, [(0, 6.0), (1.8, 0.4)], 'out')); everyone(st, self.K, t, skip=('seven',))
        for w in ('scientist_a', 'scientist_b'): A = st.actors[w]; A.gaze(tuple(Vector((STOOL[0], STOOL[1], 0.6)))); talker(st, w, t, self.lines, dict(BrowUp=0.8))
    def done(self, st):
        for o in st.actors['seven'].sv['collection'].objects: o.hide_render = False


# ------------------------------------------------------------------------------------------------ more of the day (longer scene)
class C01(Lab):
    """Dr B runs a little scanner over the device in his forearm. It lights up under the light; numbers on the screen jump."""
    dur = 7.0; lines = [(1.0, 'scientist_b', "Implant's stable. Recall's up four percent."), (4.6, 'scientist_a', "Four. Write that down.")]
    def setup(self, st):
        K = seated(st, {'seven': st.actors['seven'].key('study', root=STOOL, heading=st.heading_to(STOOL, (0.0, 1.0)), pin=(['Seat'], (STOOL[0], STOOL[1], STOOL_TOP + 0.12)))}); self.base(st, K)
        at = (STOOL[0] - 0.55, STOOL[1] + 0.3); self.kb = st.key('scientist_b', 'upright', at, st.heading_to(at, STOOL), sink=0.0); st.pose_all({'scientist_b': self.kb}); bpy.context.view_layer.update()
        self.c, self.n = st.actors['seven'].device(); st.camera(tuple(self.c + self.n * 0.55 + Vector((0.35, -0.3, 0.2))), tuple(self.c), lens=55, fstop=2.8); self.light(st, 'seven')
    def frame(self, st, t):
        B = st.actors['scientist_b']; B.apply(self.kb); B.alive(t, restless=0.2); sweep = 0.06 * math.sin(2 * math.pi * 0.5 * t); B.reach('Right', tuple(self.c + self.n * 0.10 + Vector((sweep, 0, 0.04))), (0, -1, -1))
        talker(st, 'scientist_b', t, self.lines); talker(st, 'scientist_a', t, self.lines); S7 = st.actors['seven']; S7.apply(self.K['seven']); S7.alive(t, restless=0.2); S7.gaze(tuple(B.point('RightHand')))
        S7.face(Blink=anim.blinks(t, [2.2, 5.5])); everyone(st, self.K, t, skip=('seven', 'scientist_b')); device_on(st, t, 0.9 + 0.1 * math.sin(10 * t))


class C02(Lab):
    """He plucks the pen out of Dr A's coat pocket and puts it in his mouth. Dr A takes it back without looking."""
    dur = 6.0; lines = [(3.2, 'scientist_a', "Not food, Seven.")]
    def setup(self, st):
        K = seated(st); at = (STOOL[0] + 0.55, STOOL[1] + 0.25); self.ka = st.key('scientist_a', 'upright', at, st.heading_to(at, (0.0, 1.0)), sink=0.0); K['scientist_a'] = self.ka; self.base(st, K)
        self.k_eat = st.actors['seven'].key('eat', root=STOOL, heading=st.heading_to(STOOL, (0.0, 1.0)), pin=(['Seat'], (STOOL[0], STOOL[1], STOOL_TOP + 0.12)))
        st.pose_all(self.K); st.group(['seven', 'scientist_a'], angle=-30, up=4, lens=45, margin=1.3); self.light(st, 'seven')
        if not bpy.data.objects.get('Pen'):
            import bmesh; me = bpy.data.meshes.new('Pen'); bm_ = bmesh.new(); bmesh.ops.create_cone(bm_, cap_ends=True, segments=8, radius1=0.005, radius2=0.005, depth=0.14); bm_.to_mesh(me); bm_.free()
            me.materials.append(lab._mat('PenBlue', '#1d3c8a', 0.3)); st.sc.collection.objects.link(bpy.data.objects.new('Pen', me))
        self.pen = bpy.data.objects['Pen']
    def frame(self, st, t):
        S7 = st.actors['seven']; A = st.actors['scientist_a']; A.apply(self.ka); A.alive(t, restless=0.3); w = anim.curve(t, [(0.6, 0), (1.4, 1), (3.4, 1), (3.8, 0)])
        S7.apply(anim.Track([(0, self.K['seven']), (1, self.k_eat)], S7).at(w)); S7.alive(t, restless=0.4); bpy.context.view_layer.update(); pocket = A.point('Spine2') + Vector((0, 0, 0.05)) + (S7.point('Eyes') - A.point('Eyes')).normalized() * 0.12
        if t < 1.0: S7.reach('Right', tuple(S7.point('RightHand').lerp(pocket, anim.curve(t, [(0.2, 0), (0.8, 1)]))), (0, 0, -1)); self.pen.location = pocket
        elif t < 3.6: self.pen.location = S7.point('RightPalm') + Vector((0, 0, 0.04))
        else: A.reach('Right', tuple(S7.mouth()), (1, 0, -1)); self.pen.location = A.point('RightPalm') + Vector((0, 0, 0.03))
        self.pen.rotation_euler = (math.radians(80), 0, 0.4); self.pen.hide_render = False; chew = 0.25 * max(0.0, math.sin(2 * math.pi * 2.5 * t)) ** 1.5 * (1.5 < t < 3.4)
        S7.face(JawOpen=chew, Pout=0.4 if t > 3.6 else 0.0, Blink=anim.blinks(t, [2.4])); talker(st, 'scientist_a', t, self.lines); A.gaze(tuple(Vector((1.35, 1.25, 1.3))))
        everyone(st, self.K, t, skip=('seven', 'scientist_a')); device_on(st, t)
    def done(self, st): self.pen.hide_render = True


class C03(Lab):
    """While they talk over his head, his eyes go to the door: a steel door with a small square of window. Daylight in it."""
    dur = 6.0; lines = [(0.6, 'scientist_b', "They want the full battery by Friday."), (3.4, 'scientist_a', "Then they can come down here and do it themselves.")]
    def setup(self, st):
        self.base(st, seated(st)); door(st)
        st.close('seven', angle=-150, up=0, lens=85); self.light(st, 'seven')
    def frame(self, st, t):
        everyone(st, self.K, t); S7 = st.actors['seven']; door = Vector((-2.6, -4.9, 1.65)); look = anim.curve(t, [(1.2, 0), (1.6, 1)])
        if look > 0.5: S7.gaze(tuple(door))
        S7.face(BrowUp=0.4 * look, Blink=anim.blinks(t, [4.4])); talker(st, 'scientist_a', t, self.lines); talker(st, 'scientist_b', t, self.lines); device_on(st, t)


def hide_seven(st, v=True):
    for o in st.actors['seven'].sv['collection'].objects: o.hide_render = v


class C04(Lab):
    """The door: the little window of daylight, far away across the white room."""
    dur = 3.5
    def setup(self, st): self.base(st, seated(st)); hide_seven(st); st.camera((STOOL[0], STOOL[1], 1.30), (-2.6, -4.9, 1.6), lens=50, fstop=4.0, focus=4.9); self.light(st, 'scientist_a')
    def frame(self, st, t): everyone(st, self.K, t, skip=('seven',))
    def done(self, st): hide_seven(st, False)


class C05(Lab):
    """Dr B at the counter, back turned, fills a syringe. From where Seven sits, it is the only thing in the room."""
    dur = 5.0
    def setup(self, st):
        self.base(st, seated(st)); at = (-1.6, 0.9); self.kb = st.key('scientist_b', 'upright', at, st.heading_to(at, (-3.0, 1.2)), sink=0.0); st.pose_all({'scientist_b': self.kb}); hide_seven(st)
        st.camera((STOOL[0] + 0.35, STOOL[1] - 0.25, 1.35), (-1.7, 0.95, 1.1), lens=60, fstop=2.8); self.light(st, 'scientist_b')
    def frame(self, st, t):
        B = st.actors['scientist_b']; B.apply(self.kb); B.alive(t, restless=0.2); bpy.context.view_layer.update(); c = B.point('Spine2') + Vector((-0.30, 0.05, 0.05)); turn = anim.curve(t, [(2.6, 0), (3.4, 1)])
        B.reach('Right', tuple(c.lerp(B.point('RightArm') + Vector((0.25, -0.35, -0.05)), turn)), (0, 0, -1)); self.pr.needle.hide_render = False; self.pr.needle.location = B.point('RightPalm') + Vector((0, 0, 0.05)); self.pr.needle.rotation_euler = (0, 0, 0)
        everyone(st, self.K, t, skip=('seven', 'scientist_b'))
    def done(self, st): hide_seven(st, False); self.pr.needle.hide_render = True


# ------------------------------------------------------------------------------------------------ v3: the day, longer (SHOTLIST_v3 SCENE 1, D01–D11)
SCREEN = Vector((1.35, 1.25, 1.30))                                                         # where Props stands the monitor (by the table's far corner, turned to him)
SEAT = (STOOL[0], STOOL[1], STOOL_TOP + 0.12)


class D01(Lab):
    """Dr A scratches the back of his head, reading the screen. On the stool, at the same moment, Seven does the same."""
    dur = 6.5; lines = [(1.0, 'scientist_b', "He's doing you again."), (3.6, 'scientist_a', "He's not doing me.")]
    def setup(self, st):
        at = (DRA[0] - 0.1, DRA[1] + 0.1); K = seated(st, {'scientist_a': st.key('scientist_a', 'upright', at, st.heading_to(at, tuple(SCREEN.xy)), sink=0.0)}); self.base(st, K)
        look = (0.05, -0.05, 1.10); st.camera((-1.4, 3.6, 1.75), look, lens=35, fstop=5.6); st.unblock(CAST, look); self.light(st, 'seven')
    def frame(self, st, t):
        everyone(st, self.K, t); S7 = st.actors['seven']; A = st.actors['scientist_a']; Bs = st.actors['scientist_b']; bpy.context.view_layer.update()
        wa = anim.curve(t, [(0.3, 0), (0.8, 1), (1.9, 1), (2.4, 0), (3.95, 0), (4.25, 1), (5.4, 1), (5.9, 0)])           # the second time on "…me."
        w7 = anim.curve(t, [(0.45, 0), (0.95, 1), (2.0, 1), (2.5, 0), (4.0, 0), (4.3, 1), (5.5, 1), (6.0, 0)])
        head_scratch(st, 'scientist_a', t, wa); head_scratch(st, 'seven', t + 0.1, w7)
        if t < 3.4: A.gaze(tuple(SCREEN))
        else: A.gaze(tuple(Bs.point('Eyes')))
        Bs.gaze(tuple(A.point('Eyes')) if t < 4.6 else tuple(S7.point('Eyes'))); talker(st, 'scientist_a', t, self.lines, dict(BrowDown=0.3)); talker(st, 'scientist_b', t, self.lines, dict(BrowUp=0.4))
        S7.gaze(tuple(A.point('Eyes'))); S7.face(**full(dict(Blink=anim.blinks(t, [2.9]), BrowUp=0.25, Pout=0.2 * w7))); device_on(st, t)


class D03(Lab):
    """Dr A over-articulates at the fishing card. Seven leans in, lips funnelled, and gives him a full pant-hoot in the face."""
    dur = 6.5; lines = [(0.4, 'scientist_a', "Fish. Fiiish. Say it, Seven."), (4.4, 'scientist_b', "…He said it.")]
    HOOT = 1.9
    def setup(self, st):
        at = (DRA[0] - 0.55, DRA[1] - 0.35); h = st.heading_to(at, STOOL); K = seated(st, {'scientist_a': st.key('scientist_a', 'upright', at, h, sink=0.0)}); self.base(st, K)
        self.ka = K['scientist_a']; self.ka_back = st.key('scientist_a', 'upright', (at[0] + 0.06, at[1] + 0.02), h, sink=0.0, tweak={'Spine2': (0, 0.18, 0.98), 'Neck': (0, 0.10, 0.99), 'Head': (0, 0.25, 0.97)})
        self.k_lean = st.actors['seven'].key('sit', root=STOOL, heading=st.heading_to(STOOL, at), pin=(['Seat'], SEAT), tweak={'Spine1': (0, -0.45, 0.89), 'Spine2': (0, -0.60, 0.80), 'Neck': (0, -0.65, 0.76), 'Head': (0, -0.20, 0.98)})
        st.pose_all(K); st.over('scientist_a', 'seven', side=1, lens=55, fstop=2.8); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; A = st.actors['scientist_a']; hoot, ar = B.pant_hoot(t, self.HOOT, length=0.55)
        lean = anim.curve(t, [(1.2, 0), (1.9, 1), (4.5, 1), (5.4, 0.3)]); S7.apply(anim.Track([(0, self.K['seven']), (1, self.k_lean)], S7).at(lean)); S7.alive(t, breath=1.0 + 2.0 * ar, rate=0.3 + 0.8 * ar, restless=0.4 + 2.5 * ar); B.sway(S7, t, rate=1.6, depth=0.35 * ar)
        back = anim.curve(t, [(2.7, 0), (3.0, 1), (5.0, 1), (5.8, 0.4)]); A.apply(anim.Track([(0, self.ka), (1, self.ka_back)], A).at(back)); A.alive(t, restless=0.3); bpy.context.view_layer.update()
        e7 = S7.point('Eyes'); toward = (A.point('Eyes') - e7).normalized(); up = e7 + toward * 0.42 + Vector((0, 0, -0.10)); low = e7 + toward * 0.55 + Vector((0, 0, -0.42))
        card_at = up.lerp(low, anim.curve(t, [(1.5, 0), (2.1, 1)])); A.reach('Right', tuple(card_at + Vector((0.0, 0.0, -0.08))), (1, 0, -1)); self.pr.in_hand(self.pr.cards['fishing'], A)
        A.gaze(tuple(e7)); talker(st, 'scientist_a', t, self.lines, dict(BrowUp=0.9 * back)); A.face(Blink=max(anim.blinks(t, [3.1, 3.5]), 0.5 * anim.curve(t, [(3.0, 0), (3.2, 1), (4.2, 1), (4.5, 0)])))
        S7.gaze(tuple(A.point('Eyes')) if t > 1.3 else tuple(self.pr.cards['fishing'].location))
        S7.face(**full(hoot, dict(Pout=0.5 * anim.curve(t, [(1.3, 0), (1.8, 1)]) if t < self.HOOT else 0.0, Blink=anim.blinks(t, [0.9, 5.3]), BrowUp=0.3)))
        everyone(st, self.K, t, skip=('seven', 'scientist_a')); talker(st, 'scientist_b', t, self.lines); device_on(st, t, 0.9 + 0.1 * ar)


class D11(Lab):
    """The tower is taller than he can reach. He stands up ON the stool to put the last block on."""
    dur = 6.0; lines = [(3.8, 'scientist_b', "He's never done that.")]
    BASE = Vector((0.0, 0.40, 0.835))                                                        # the bottom block's centre, on the table top
    def setup(self, st):
        K = seated(st); self.base(st, K); h = st.heading_to(STOOL, (0.0, 1.0)); S7 = st.actors['seven']
        k_try = S7.key('reach', root=STOOL, heading=h, pin=(['Seat'], SEAT), tweak={'Spine2': (0, -0.30, 0.95), 'Head': (0, -0.05, 1.0)})
        k_crouch = S7.key('crouch', root=STOOL, heading=h, sink=STOOL_TOP - 0.01); k_stand = S7.key('stand', root=STOOL, heading=h, sink=STOOL_TOP - 0.01)
        self.track = anim.Track([(0, K['seven']), (0.6, k_try, 'out'), (1.5, k_try), (2.0, K['seven']), (2.3, k_crouch, 'inout'), (2.9, k_stand, 'out'), (6.0, k_stand)], S7)
        self.extra = []
        for i in range(4):                                                                 # four more blocks: nine stacked, the tenth in his hand
            o = bpy.data.objects.get(f'TowerBlock{i}') or lab._box(f'TowerBlock{i}', (0.07, 0.07, 0.07), (0, 0, 0), bpy.data.materials.get(f'Block{i}'), st.sc.collection)
            o.hide_render = False; self.extra.append(o)
        self.tower = list(self.pr.blocks[1:]) + self.extra
        for i, b in enumerate(self.tower): b.location = self.BASE + Vector((0.004 * math.sin(1.7 * i), 0.0, 0.07 * i)); b.rotation_euler = (0, 0, 0.06 * math.sin(2.3 * i))
        self.top = self.BASE + Vector((0, 0, 0.07 * len(self.tower)))
        st.pose_all(K); look = (-0.15, 0.0, 1.10); st.camera((-2.2, 1.5, 1.45), look, lens=32, fstop=4.0); st.unblock(['seven', 'scientist_b'], look); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.track.at(t)); S7.alive(t, restless=0.4); bpy.context.view_layer.update(); blk = self.pr.blocks[0]
        try_ = anim.curve(t, [(0.5, 0), (1.0, 1), (1.4, 1), (1.8, 0)]); put = anim.curve(t, [(2.9, 0), (3.5, 1), (3.9, 1), (4.3, 0)]); rest = S7.point('RightHand')
        if try_ > 0: S7.reach('Right', tuple(rest.lerp(self.top + Vector((0, -0.05, 0.06)), try_)), (0, 0, -1))      # can't: the arm runs out short of the top
        if put > 0: S7.reach('Right', tuple(rest.lerp(self.top + Vector((0, -0.02, 0.07)), put)), (0, 0, -1))
        bpy.context.view_layer.update()
        if t < 3.5: blk.location = S7.point('RightPalm') + Vector((0, 0, -0.03)); blk.rotation_euler = (0.2, 0.1, 0.3)
        else: blk.location = self.top; blk.rotation_euler = (0, 0, 0)
        S7.gaze(tuple(self.top) if t < 4.4 else tuple(st.actors['scientist_b'].point('Eyes'))); S7.face(**full(dict(Pout=0.35, BrowDown=0.3 * try_, BrowUp=0.4 * (t > 3.6), Blink=anim.blinks(t, [2.1, 4.5]))))
        everyone(st, self.K, t, skip=('seven',)); Bs = st.actors['scientist_b']; Bs.gaze(tuple(S7.point('Eyes')) if t > 2.0 else tuple(self.top)); talker(st, 'scientist_b', t, self.lines, dict(BrowUp=anim.curve(t, [(2.2, 0), (2.8, 0.9)]))); device_on(st, t, 1.0)
    def done(self, st):
        for o in self.extra: o.hide_render = True


class D02(Lab):
    """Close on hands: Dr A holds his out; Seven puts his in it; one shake. Dr A lets go. Seven's hand stays out. He stares at it."""
    dur = 6.5; lines = [(1.8, 'scientist_a', "Good job, Seven. Shake.")]
    def setup(self, st):
        at = (0.62, -0.42); K = seated(st, {'scientist_a': st.key('scientist_a', 'upright', at, st.heading_to(at, STOOL), sink=0.0, rcurl=(0.3, 0.4, 0.3))}); self.base(st, K)
        self.k7 = st.actors['seven'].key('reach', root=STOOL, heading=st.heading_to(STOOL, (0.6, 0.5)), pin=(['Seat'], SEAT), rcurl=(0.35, 0.5, 0.35))
        st.pose_all(K); S7 = st.actors['seven']; A = st.actors['scientist_a']; s7 = S7.point('RightArm'); sa = A.point('RightArm')
        self.M = s7.lerp(sa, 0.45); self.M.z = 0.97; d = sa - s7; d.z = 0; self.d = d.normalized(); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; A = st.actors['scientist_a']; out = anim.curve(t, [(1.0, 0), (2.0, 1)]); S7.apply(anim.Track([(0, self.K['seven']), (1, self.k7)], S7).at(out)); S7.alive(t, restless=0.3)
        A.apply(self.K['scientist_a']); A.alive(t, restless=0.2); bpy.context.view_layer.update()
        shake = 0.045 * math.sin(2 * math.pi * (t - 2.4) / 0.8) if 2.4 <= t <= 3.2 else 0.0; M = self.M + Vector((0, 0, shake))
        rest_a = A.point('RightHand'); give = anim.curve(t, [(0.3, 0), (1.2, 1), (3.6, 1), (4.2, 0)]); A.reach('Right', tuple(rest_a.lerp(M + self.d * 0.07, give)), (0, 0, -1))
        rest_7 = S7.point('RightHand'); take = anim.curve(t, [(1.2, 0), (2.1, 1)]); S7.reach('Right', tuple(rest_7.lerp(M - self.d * 0.07 + Vector((0, 0, 0.02)), take)), (0, 0, -1)); bpy.context.view_layer.update()
        A.gaze(tuple(S7.point('Eyes'))); talker(st, 'scientist_a', t, self.lines)
        S7.gaze(tuple(A.point('Eyes')) if t < 2.2 else tuple(M)); S7.face(**full(dict(Blink=anim.blinks(t, [1.5, 4.9]), BrowUp=0.3 + 0.4 * anim.curve(t, [(4.0, 0), (4.6, 1)]), Pout=0.25 * anim.curve(t, [(4.4, 0), (5.0, 1)]))))
        u = anim.curve(t, [(4.0, 0), (5.2, 1)]); e7 = S7.point('Eyes'); look = self.M.lerp(e7, 0.45 * u)
        st.camera(tuple(self.M + Vector((-0.25, 0.62, 0.20))), tuple(look), lens=50 - 14 * u, fstop=2.8)
        everyone(st, self.K, t, skip=('seven', 'scientist_a')); device_on(st, t)


class D04(Lab):
    """Seven between the two of them while they talk over his head. His eyes slide to the door."""
    dur = 8.0; lines = [(0.8, 'scientist_b', "Do they ever tell you what it's for?"), (3.4, 'scientist_a', "Recall. That's all they ever say. Recall."), (6.3, 'scientist_a', "Don't get attached.")]
    def setup(self, st):
        a, b = (0.85, -0.38), (-0.85, -0.38); h = st.heading_to
        K = seated(st, {'scientist_a': st.key('scientist_a', 'upright', a, h(a, b), sink=0.0), 'scientist_b': st.key('scientist_b', 'upright', b, h(b, a), sink=0.0)}); self.base(st, K); door(st)
        self.k_turn = st.actors['seven'].key('sit', root=STOOL, heading=h(STOOL, (0.0, 1.0)) + 0.9, pin=(['Seat'], SEAT))      # round on the stool, to his left, toward the door
        st.pose_all(K); look = (0.0, -0.30, 1.10); st.camera((0.0, 2.7, 1.35), look, lens=32, fstop=4.0); st.unblock(CAST, look); self.light(st, 'seven')
    def frame(self, st, t):
        everyone(st, self.K, t, skip=('seven',)); S7 = st.actors['seven']; turn = anim.curve(t, [(5.3, 0), (6.6, 1)]); S7.apply(anim.Track([(0, self.K['seven']), (1, self.k_turn)], S7).at(turn)); S7.alive(t, restless=0.5)
        B.head(S7, yaw=50 * anim.curve(t, [(5.6, 0), (6.8, 1)])); bpy.context.view_layer.update(); A = st.actors['scientist_a']; Bs = st.actors['scientist_b']
        if t < 3.3: S7.gaze(tuple(Bs.point('Eyes')))
        elif t < 4.8: S7.gaze(tuple(A.point('Eyes')))
        elif t < 5.4: S7.gaze_dir(35, -5)
        else: S7.gaze((-2.6, -4.9, 1.65))
        S7.face(**full(dict(Blink=anim.blinks(t, [2.2, 3.35, 5.35]), BrowUp=0.35 * turn)))
        A.gaze(tuple(Bs.point('Eyes')) if t < 6.0 else tuple(S7.point('Eyes'))); Bs.gaze(tuple(A.point('Eyes')) if t < 7.0 else tuple(S7.point('Eyes')))
        talker(st, 'scientist_a', t, self.lines); talker(st, 'scientist_b', t, self.lines, dict(BrowUp=0.3)); device_on(st, t)


def bird(st):
    """A small dark shape seen from below against the light: a bird (made once)."""
    o = bpy.data.objects.get('DoorBird')
    if o is None:
        import swamp
        V = [(-0.05, 0, 0.012), (-0.02, 0, 0.0), (0.0, 0, 0.006), (0.02, 0, 0.0), (0.05, 0, 0.012), (0.02, 0, -0.004), (0.0, 0, -0.008), (-0.02, 0, -0.004)]
        o = swamp._mesh('DoorBird', V, [tuple(range(8))], lab._mat('BirdDark', '#0c0c0c', 0.9), smooth=False, coll=st.sc.collection)
    o.hide_render = False; return o


class D05(Lab):
    """His POV through the door's little window: a square of daylight. Something small and dark crosses it."""
    dur = 4.0
    def setup(self, st):
        self.base(st, seated(st)); hide_seven(st); door(st); self.bird = bird(st); st.clear_lamps(); st.lamp('DoorKey', (-1.6, -3.2, 2.6), (-2.6, -4.9, 1.4), 300, (1.0, 1.0, 1.0), 2.0, only_troop=False)
    def frame(self, st, t):
        st.camera((-2.56, -4.02 - 0.2 * t / self.dur, 1.62), (-2.6, -4.96, 1.65), lens=32, fstop=2.8); bright(st, -0.5)
        u = anim.curve(t, [(1.2, 0), (2.4, 1)], 'linear'); self.bird.location = (-2.82 + 0.44 * u, -4.905, 1.64 + 0.03 * math.sin(math.pi * u) + 0.006 * math.sin(30 * t))
        self.bird.scale = (1.0, 1.0, 1.0 + 0.8 * math.sin(2 * math.pi * 6.0 * t)); self.bird.hide_render = not (0 < u < 1)
        everyone(st, self.K, t, skip=('seven',)); S.device_power(st.actors['seven'].sv, 0.0)
    def done(self, st): hide_seven(st, False); self.bird.hide_render = True; bright(st)


class D06(Lab):
    """After the screen dies: his face, faint in the black glass. He touches it."""
    dur = 4.5
    def setup(self, st):
        K = seated(st); pos = (0.82, 0.95); K['seven'] = st.key('seven', 'reach', pos, st.heading_to(pos, tuple(SCREEN.xy)), sink=0.80); self.base(st, K)    # up on the table's corner, by the screen
        sh = bpy.data.materials['ScreenImg'].node_tree.nodes['Principled BSDF']; sh.inputs['Emission Strength'].default_value = 0.0; sh.inputs['Roughness'].default_value = 0.05
        st.pose_all(K); S7 = st.actors['seven']; e = S7.point('Eyes'); nrm = Vector((STOOL[0], STOOL[1], 0)) - Vector((SCREEN.x, SCREEN.y, 0)); nrm.normalize(); self.nrm = nrm
        tan = Vector((-nrm.y, nrm.x, 0)); self.P = SCREEN + nrm * 0.006 - tan * 0.06 + Vector((0, 0, -0.04)); f = SCREEN - e; f.z = 0; f.normalize(); left = Vector((-f.y, f.x, 0))
        cam = e - f * 0.32 + left * 0.10 + Vector((0, 0, 0.07)); st.camera(tuple(cam), tuple(SCREEN + Vector((0, 0, -0.02))), lens=45, fstop=2.0); st.unblock('seven', tuple(SCREEN)); self.light(st, 'seven', 0.6)
        st.lamp('GlassGlow', tuple(SCREEN + nrm * 0.25 + tan * 0.5 + Vector((0, 0, 0.30))), tuple(e), 25, (0.75, 0.85, 1.0), 0.5)
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.K['seven']); S7.alive(t, restless=0.25); bpy.context.view_layer.update(); w = anim.curve(t, [(1.4, 0), (2.8, 1)])
        if w > 0.01: S7.touch('Right', tuple(S7.point('RightTip').lerp(self.P, w)), tuple(-self.nrm))
        S7.gaze(tuple(self.P)); S7.face(**full(dict(BrowUp=0.45, Pout=0.25 * w, Blink=anim.blinks(t, [1.0, 3.7])))); everyone(st, self.K, t, skip=('seven',)); device_on(st, t, 0.6)
    def done(self, st):
        sh = bpy.data.materials['ScreenImg'].node_tree.nodes['Principled BSDF']; sh.inputs['Emission Strength'].default_value = 2.5; sh.inputs['Roughness'].default_value = 0.2


def fruit(st):
    o = bpy.data.objects.get('LabFruit')
    if o is None:
        import bmesh; me = bpy.data.meshes.new('LabFruit'); bm_ = bmesh.new(); bmesh.ops.create_uvsphere(bm_, u_segments=16, v_segments=10, radius=0.028); bm_.to_mesh(me); bm_.free()
        for p_ in me.polygons: p_.use_smooth = True
        me.materials.append(lab._mat('LabFruit', '#c8402a', 0.35)); o = bpy.data.objects.new('LabFruit', me); st.sc.collection.objects.link(o)
    o.hide_render = False; return o


class D07(Lab):
    """Dr B holds a fruit out on her flat palm; he takes it delicately with his lips. Over her shoulder, on the table: the syringe. He stops chewing."""
    dur = 6.0
    SYRINGE = Vector((-0.72, 0.62, 0.822))
    def setup(self, st):
        at = (-0.62, -0.02); K = seated(st, {'scientist_b': st.key('scientist_b', 'upright', at, st.heading_to(at, STOOL), sink=0.0, rcurl=(0.05, 0.08, 0.05))}); self.base(st, K)
        self.k_lean = st.actors['seven'].key('sit', root=STOOL, heading=st.heading_to(STOOL, (-0.5, 0.6)), pin=(['Seat'], SEAT), tweak={'Spine2': (0, -0.50, 0.87), 'Neck': (0, -0.65, 0.76), 'Head': (0, -0.45, 0.89)})
        self.fruit = fruit(st); nd = self.pr.needle; nd.hide_render = False; nd.location = self.SYRINGE; nd.rotation_euler = (math.pi / 2, 0, 0.5)
        st.pose_all(K); self.cam = Vector((0.75, 0.40, 1.22)); self.light(st, 'seven')
    def frame(self, st, t):
        S7 = st.actors['seven']; Bs = st.actors['scientist_b']; lean = anim.curve(t, [(1.4, 0), (2.3, 1), (2.8, 1), (3.4, 0.2)]); S7.apply(anim.Track([(0, self.K['seven']), (1, self.k_lean)], S7).at(lean)); S7.alive(t, restless=0.3)
        Bs.apply(self.K['scientist_b']); Bs.alive(t, restless=0.15); bpy.context.view_layer.update(); mouth = S7.mouth()
        offer = anim.curve(t, [(0.2, 0), (1.3, 1), (2.6, 1), (3.3, 0.2)]); rest = Bs.point('RightHand'); Bs.reach('Right', tuple(rest.lerp(mouth + Vector((0, 0, -0.07)) + (Bs.point('Eyes') - mouth).normalized() * 0.10, offer)), (0, 0, -1)); bpy.context.view_layer.update()
        palm = Bs.point('RightPalm') + Vector((0, 0, 0.035)); took = anim.curve(t, [(2.3, 0), (2.6, 1)]); self.fruit.location = palm.lerp(mouth, took); self.fruit.hide_render = t > 2.75
        sees = anim.curve(t, [(3.5, 0), (3.8, 1)]); chew = B.chew(t, on=2.75 < t < 3.75)
        S7.gaze(tuple(palm) if t < 2.7 else (tuple(self.SYRINGE) if t > 3.4 else tuple(Bs.point('Eyes'))))
        S7.face(**full(chew, dict(Pout=0.55 * anim.curve(t, [(1.9, 0), (2.3, 1), (2.6, 0)]), JawOpen=0.08 * anim.curve(t, [(2.0, 0), (2.3, 1), (2.6, 0)]), BrowUp=0.9 * sees, Blink=anim.blinks(t, [1.2]) if t < 3.5 else 0.0)))
        Bs.gaze(tuple(S7.point('Eyes'))); Bs.face(**full(dict(BrowUp=0.2, Blink=anim.blinks(t, [1.9, 4.6]))))
        pan = anim.curve(t, [(3.0, 0), (3.8, 1), (4.5, 1), (5.3, 0)]); look = (mouth + Vector((0, 0, 0.04))).lerp(self.SYRINGE, pan)
        st.camera(tuple(self.cam), tuple(look), lens=50, fstop=2.0, focus=(look - self.cam).length); everyone(st, self.K, t, skip=('seven', 'scientist_b')); device_on(st, t, 0.9 + 0.1 * sees)
    def done(self, st): self.fruit.hide_render = True; self.pr.needle.hide_render = True


class D08(Lab):
    """His POV: the needle swims in and out of focus. The alarm light."""
    dur = 3.0
    def setup(self, st):
        K = seated(st); a = (STOOL[0] - 0.55, STOOL[1] + 0.05); self.kb = st.key('scientist_b', 'upright', a, st.heading_to(a, STOOL), sink=0.0); b = (STOOL[0] + 0.5, STOOL[1] - 0.45); self.ka = st.key('scientist_a', 'upright', b, st.heading_to(b, STOOL), sink=0.0)
        self.base(st, K); st.pose_all({'scientist_a': self.ka, 'scientist_b': self.kb, 'seven': K['seven']}); S7 = st.actors['seven']; self.eye = S7.point('Eyes'); self.arm = S7.point('LeftForeArm').lerp(S7.point('LeftHand'), 0.3)
        hide_seven(st); self.light(st, 'scientist_b')
    def frame(self, st, t):
        Bs = st.actors['scientist_b']; Bs.apply(self.kb); Bs.alive(t, restless=0.3); bpy.context.view_layer.update(); w = 0.85 + 0.1 * anim.curve(t, [(0, 0), (3.0, 1)])
        Bs.reach('Right', tuple(Bs.point('RightHand').lerp(self.arm + Vector((0, 0, 0.08)), w)), (0, -1, -1)); bpy.context.view_layer.update(); nd = self.pr.needle; nd.hide_render = False
        nd.location = Bs.point('RightPalm'); d = (self.arm - Bs.point('RightPalm')).normalized(); nd.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        A = st.actors['scientist_a']; A.apply(self.ka); A.alive(t, restless=0.4); Bs.face(**full(dict(BrowDown=0.4, Blink=anim.blinks(t, [1.7]))))
        dist = (Vector(nd.location) - self.eye).length; swim = 0.5 + 0.5 * math.sin(2 * math.pi * 0.7 * t + 1.0); jit = Vector((anim.wobble(t, 1.0, 1.3), anim.wobble(t, 2.0, 1.1), anim.wobble(t, 3.0, 1.5))) * 0.012
        st.camera(tuple(self.eye + jit), tuple(Vector(nd.location)), lens=55, fstop=1.4, focus=dist * (1.0 + 1.4 * swim))
        self.pr.alarm.data.energy = 400.0 * (0.5 + 0.5 * math.sin(2 * math.pi * 2.0 * t)); device_on(st, t, 0.9 + 0.1 * math.sin(6 * t))
    def done(self, st): hide_seven(st, False); self.pr.needle.hide_render = True


class D09(Lab):
    """Handheld: Dr A grabs his arm. Seven whips round, canines bared, and bites the coat sleeve. Dr A rips free."""
    dur = 4.0; lines = [(0.3, 'scientist_a', "Hold—"), (2.0, 'scientist_a', "He BIT me!")]
    def setup(self, st):
        K = seated(st); self.base(st, K); P = panic_keys(st); top = (STOOL[0], STOOL[1] + 0.45); at = (0.55, -0.30); S7 = st.actors['seven']; Ac = st.actors['scientist_a']
        k_turn = S7.key('crouch', root=top, heading=st.heading_to(top, at), z=0.80 + 0.05, tweak={'Neck': (0, -0.75, 0.66), 'Head': (0, -0.55, 0.83)})
        self.track = anim.Track([(0, P['display']), (0.8, P['display']), (1.15, k_turn, 'out'), (4.0, k_turn)], S7)
        ka = st.key('scientist_a', 'upright', at, st.heading_to(at, top), sink=0.0); back = (at[0] + 0.35, at[1] - 0.55); ka_back = st.key('scientist_a', 'upright', back, st.heading_to(back, top), sink=0.0)
        self.walk = anim.Track([(0, ka), (1.9, ka), (2.4, ka_back, 'out'), (4.0, ka_back)], Ac)
        self.kb = st.key('scientist_b', 'upright', (DRB[0] * 1.6, DRB[1] - 0.6), K['scientist_b']['heading'], sink=0.0)
        st.pose_all({'seven': P['display'], 'scientist_a': ka, 'scientist_b': self.kb}); self.look = Vector((0.30, -0.05, 1.25)); st.camera((1.75, -2.0, 1.5), tuple(self.look), lens=35, fstop=4.0); self.light(st, 'seven', 1.2)
    def frame(self, st, t):
        S7 = st.actors['seven']; S7.apply(self.track.at(t)); S7.alive(t, breath=3.0, rate=1.2, restless=2.0); Ac = st.actors['scientist_a']; Ac.apply(self.walk.at(t)); Ac.alive(t, restless=1.0)
        Bs = st.actors['scientist_b']; Bs.apply(self.kb); Bs.alive(t, restless=1.0); bpy.context.view_layer.update()
        grab = S7.point('RightForeArm').lerp(S7.point('RightHand'), 0.4); rest = Ac.point('RightHand'); to7 = S7.point('Spine2') - Ac.point('Spine2'); to7.z = 0; to7.normalize()
        bite = anim.curve(t, [(1.0, 0), (1.3, 1), (1.9, 1)]); free = anim.curve(t, [(1.9, 0), (2.15, 1)], 'out')
        sleeve = S7.mouth() + to7 * 0.10; chest = Ac.point('Spine2') + to7 * 0.22 + Vector((0, 0, 0.05))
        hand = rest.lerp(grab, anim.curve(t, [(0.1, 0), (0.45, 1)])).lerp(sleeve, bite).lerp(chest, free); Ac.reach('Right', tuple(hand), (1, 0, -1))
        if t > 2.2: Ac.reach('Left', tuple(chest + Vector((0, 0, 0.04))), (-1, 0, -1))                                  # clutching the bitten arm
        bpy.context.view_layer.update(); Ac.gaze(tuple(S7.point('Eyes'))); talker(st, 'scientist_a', t, self.lines, dict(BrowUp=1.0, Grin=0.4 * free))
        S7.gaze(tuple(Ac.point('RightForeArm')) if t < 2.2 else tuple(Ac.point('Eyes')))
        S7.face(**full(dict(Grin=1.0, BrowDown=1.0, JawOpen=0.55 if t < 1.3 else (0.22 if t < 1.9 else 0.0)), B.scream(t, 2.0, 2.0)))
        Bs.gaze(tuple(S7.point('Eyes'))); Bs.face(**full(dict(BrowUp=1.0, JawOpen=0.3 * bite)))
        sh = 1.0 + 2.0 * anim.curve(t, [(1.0, 0), (1.2, 1), (1.9, 1), (2.3, 0)]); jit = Vector((anim.wobble(t, 1.0, 2.5), anim.wobble(t, 2.0, 2.2), anim.wobble(t, 3.0, 2.8))) * 0.03 * sh
        st.camera(tuple(Vector((1.75, -2.0, 1.5)) + jit), tuple(self.look + jit * 0.5), lens=35, fstop=4.0)
        self.pr.alarm.data.energy = 400.0 * (0.5 + 0.5 * math.sin(2 * math.pi * 2.0 * t)); device_on(st, t, 1.0); self.pr.needle.hide_render = True


class D10(Lab):
    """The white-out over, the alarm still going. Dr A picks the fire card up off the floor and turns it over."""
    dur = 8.0; lines = [(2.0, 'scientist_b', "Where did it send him?"), (5.2, 'scientist_a', "…Not where.")]
    CARD = Vector((0.45, -1.15, 0.002))
    def setup(self, st):
        self.base(st, seated(st)); hide_seven(st)
        for i, b in enumerate(self.pr.blocks): b.location = (-1.2 + 0.5 * i, -0.4 - 0.3 * (i % 2), 0.035); b.rotation_euler = (0, 0, 0.8 * i)
        self.pr.tray.location = (-1.1, -0.9, 0.012); x, rot = self.pr.screen_home; self.pr.screen.rotation_euler = (rot[0] - 1.35, rot[1], rot[2]); self.pr.screen.location = x + Vector((0, 0.25, -0.30))
        if self.pr.back: bl, br = self.pr.back_home; self.pr.back.rotation_euler = (br[0] - 1.35, br[1], br[2]); self.pr.back.location = bl + Vector((0, 0.25, -0.30))
        a0, a1 = (0.9, -0.9), (0.66, -0.96); h = st.heading_to(a1, tuple(self.CARD.xy)); Ac = st.actors['scientist_a']
        k0 = st.key('scientist_a', 'upright', a0, st.heading_to(a0, STOOL), sink=0.0); k_bend = st.key('scientist_a', 'upright', a1, h, sink=0.0, tweak={'Spine': (0, -0.35, 0.94), 'Spine1': (0, -0.62, 0.78), 'Spine2': (0, -0.78, 0.62), 'Neck': (0, -0.80, 0.60), 'Head': (0, -0.70, 0.71), 'LeftUpLeg': (0.06, -0.45, -0.89), 'LeftLeg': (0.0, 0.40, -0.92)})
        k_up = st.key('scientist_a', 'upright', a1, h, sink=0.0, tweak={'Neck': (0, -0.35, 0.94), 'Head': (0, -0.45, 0.89)})
        self.track = anim.Track([(0, k0), (0.6, k0), (1.2, k_bend, 'inout'), (1.9, k_bend), (2.6, k_up, 'inout'), (8.0, k_up)], Ac)
        self.K['scientist_b'] = st.key('scientist_b', 'upright', (-0.9, -1.0), st.heading_to((-0.9, -1.0), a1), sink=0.0); self.card = self.pr.cards['fire']
        look = (0.0, -0.9, 0.85); st.camera((0.0, -3.5, 1.5), look, lens=30, fstop=5.6); st.unblock(['scientist_a', 'scientist_b'], look); self.light(st, 'scientist_a')
    def frame(self, st, t):
        bright(st, 0.4); Ac = st.actors['scientist_a']; Ac.apply(self.track.at(t)); Ac.alive(t, restless=0.3); bpy.context.view_layer.update(); everyone(st, self.K, t, skip=('seven', 'scientist_a'))
        down = anim.curve(t, [(0.9, 0), (1.6, 1), (1.9, 1), (2.6, 0)]); rest = Ac.point('RightHand'); hold = Ac.point('Spine2') + st.face_dir('scientist_a') * 0.32 + Vector((0, 0, 0.12))
        hand = rest.lerp(self.CARD + Vector((0, 0, 0.06)), down) if t < 1.9 else hold.lerp(self.CARD + Vector((0, 0, 0.06)), down); Ac.reach('Right', tuple(hand), (1, 0, -1)); bpy.context.view_layer.update()
        if t < 1.7: self.card.location = self.CARD; self.card.rotation_euler = (math.pi, 0, 0.4)
        else:
            palm = Ac.point('RightPalm') + Vector((0, 0, 0.03)); self.card.location = self.CARD.lerp(palm, anim.curve(t, [(1.7, 0), (1.9, 1)]))
            self.card.rotation_euler = (math.pi + math.radians(105) * anim.curve(t, [(2.8, 0), (3.6, 1)]), 0, Ac.arm.rotation_euler.z)       # face down -> face up, toward him
        Ac.gaze(tuple(self.card.location)); talker(st, 'scientist_a', t, self.lines, dict(BrowDown=0.4 * anim.curve(t, [(3.6, 0), (4.4, 1)])))
        Bs = st.actors['scientist_b']; Bs.gaze(tuple(Ac.point('Eyes')) if t > 1.5 else (STOOL[0], STOOL[1], 0.6)); talker(st, 'scientist_b', t, self.lines, dict(BrowUp=0.7))
        self.pr.alarm.data.energy = 400.0 * (0.5 + 0.5 * math.sin(2 * math.pi * 2.0 * t)); S.device_power(st.actors['seven'].sv, 0.0)
    def done(self, st): hide_seven(st, False); bright(st)


# play order (SHOTLIST_v3 SCENE 1)
SHOTS = [B01(), B02(), D01(), C01(), B03(), D03(), B04(), B05(), C02(), B06(), D11(), D02(), B07(), B08(), B09(), C03(), D04(), C04(), D05(), B10(), B11(), B12(), D06(), B13(), D07(),
         C05(), B14(), B15(), D08(), B16(), D09(), B17(), B18(), B19(), B20(), D10()]
for s in SHOTS: s.name = type(s).__name__
SCENE1 = ['B01', 'B02', 'D01', 'C01', 'B03', 'D03', 'B04', 'B05', 'C02', 'B06', 'D11', 'D02', 'B07', 'B08', 'B09', 'C03', 'D04', 'C04', 'D05', 'B10', 'B11', 'B12',
          'D06', 'B13', 'D07', 'C05', 'B14', 'B15', 'D08', 'B16', 'D09', 'B17', 'B18', 'B19', 'B20', 'D10']                  # play order (SHOTLIST_v3 SCENE 1) = SHOTS


def main():
    out = os.path.abspath(sys.argv[1]); arg = lambda n, d=None: sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d
    q = arg('--quality', 'anim'); only = arg('--only'); step = int(arg('--step', 1)); os.makedirs(out, exist_ok=True)
    st = D.Stage('lab', CAST, quality=q, wet=0.0)
    for shot in SHOTS:
        if only and shot.name not in only.split(','): continue
        fdir = os.path.join(out, shot.name); os.makedirs(fdir, exist_ok=True); t0 = time.time(); shot.setup(st); n = int(round(shot.dur * FPS))
        for f in range(0, n, step):
            p = os.path.join(fdir, f'f{f + 1:04d}.png')
            if os.path.exists(p): continue
            shot.frame(st, f / FPS); bpy.context.view_layer.update(); st.render(p)
        if hasattr(shot, 'done'): shot.done(st)
        print(f'{shot.name}: {n} frames in {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__': main()

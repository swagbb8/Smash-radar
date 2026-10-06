"""Poses for Seven, written as directions each bone should point in (his own space: +X his left, -Y forward, +Z up).
Left-side entries are mirrored to the right unless the right side is given."""
import seven as S

POSES = {
    # on all fours the way chimps actually stand: weight on the knuckles, back sloping up to the shoulders, head up
    'knuckle': {
        'Hips': (0, -0.80, 0.60), 'Spine': (0, -0.84, 0.54), 'Spine1': (0, -0.88, 0.47), 'Spine2': (0, -0.92, 0.39),
        'Neck': (0, -0.55, 0.83), 'Head': (0, -0.10, 1.0),
        'LeftShoulder': (0.93, -0.25, -0.26), 'LeftArm': (0.16, -0.18, -0.97), 'LeftForeArm': (0.03, -0.20, -0.98), 'LeftHand': (0.0, -0.62, -0.78),
        'LeftUpLeg': (0.30, -0.70, -0.65), 'LeftLeg': (-0.05, 0.62, -0.78), 'LeftFoot': (0.22, -0.96, -0.16), 'LeftToeBase': (0.2, -0.98, 0.0),
    },
    # sitting back on his haunches, left forearm raised in front of his face
    'arm': {
        'Hips': (0, 0.10, 1.0), 'Spine': (0, -0.10, 1.0), 'Spine1': (0, -0.26, 0.96), 'Spine2': (0, -0.36, 0.93), 'Neck': (0, -0.48, 0.88), 'Head': (0.10, -0.55, 0.83),
        'LeftShoulder': (0.90, -0.40, -0.1), 'LeftArm': (0.20, -0.75, -0.63), 'LeftForeArm': (-0.42, -0.50, 0.76), 'LeftHand': (-0.5, -0.3, 0.8),
        'RightShoulder': (-0.92, -0.3, -0.2), 'RightArm': (-0.25, -0.35, -0.90), 'RightForeArm': (0.1, -0.75, -0.65), 'RightHand': (0.1, -0.9, -0.4),
        'LeftUpLeg': (0.55, -0.80, 0.22), 'LeftLeg': (-0.05, -0.15, -0.99), 'LeftFoot': (0.25, -0.96, -0.1),
    },
}
POSES['look'] = {   # squatting, left forearm held across his chest like someone checking a watch, the device turned up toward his eyes
    'Hips': (0, 0.20, 0.98), 'Spine': (0, -0.02, 1.0), 'Spine1': (0, -0.20, 0.98), 'Spine2': (0, -0.30, 0.95), 'Neck': (0.03, -0.50, 0.87), 'Head': (0.10, -0.52, 0.85),
    'LeftShoulder': (0.92, -0.38, -0.05), 'LeftArm': (0.50, -0.62, -0.60), 'LeftForeArm': ((-0.84, -0.46, 0.28), 0.0, ((0, 0, 1), (0.25, -0.50, 0.83))), 'LeftHand': ((-0.92, -0.38, 0.05), 0.0, ((0, 0, 1), (0.2, -0.5, 0.84))),
    'RightShoulder': (-0.92, -0.3, -0.2), 'RightArm': (-0.34, -0.20, -0.92), 'RightForeArm': (-0.10, -0.50, -0.86), 'RightHand': (0.0, -0.85, -0.5),
    'LeftUpLeg': (0.66, -0.70, 0.27), 'LeftLeg': (-0.10, -0.10, -0.99), 'LeftFoot': (0.32, -0.94, -0.08),
}
POSES['study'] = {  # sitting back on his haunches, left forearm held level across his body, head bowed to stare at the thing in it
    'Hips': (0, 0.22, 0.97), 'Spine': (0, 0.02, 1.0), 'Spine1': (0, -0.16, 0.99), 'Spine2': (0, -0.26, 0.96), 'Neck': (0.04, -0.48, 0.88), 'Head': (0.10, -0.50, 0.86),
    'LeftShoulder': (0.90, -0.42, 0.02), 'LeftArm': (0.36, -0.52, -0.78), 'LeftForeArm': ((-0.80, -0.58, 0.14), 0.0, ((0, 0, 1), (0.30, -0.50, 0.81))), 'LeftHand': ((-0.86, -0.50, -0.08), 0.0, ((0, 0, 1), (0.3, -0.5, 0.81))),
    'RightShoulder': (-0.92, -0.3, -0.2), 'RightArm': (-0.26, -0.30, -0.92), 'RightForeArm': (0.20, -0.70, -0.68), 'RightHand': (0.35, -0.85, -0.38),
    'LeftUpLeg': (0.62, -0.74, 0.25), 'LeftLeg': (-0.08, -0.12, -0.99), 'LeftFoot': (0.30, -0.95, -0.08),
}
# ---- waking in the mud (ARISE)
POSES['prone'] = {   # face down where he fell, right cheek up: head turned to his right, right hand in the mud in front of his face, left arm (the one with the device) trailing back, its top side down in the mud
    'Hips': (0, -1, 0.03), 'Spine': (0, -1, 0.02), 'Spine1': (0, -1, 0.04), 'Spine2': (0, -0.99, 0.10), 'Neck': (-0.10, -0.97, 0.18),
    'Head': ((-0.20, -0.95, 0.22), 0.0, ((0, -1, 0), (-1.0, -0.15, 0.25))),
    'RightShoulder': (-0.90, -0.40, 0.0), 'RightArm': (-0.77, 0.63, -0.05), 'RightForeArm': (-0.20, -0.98, -0.02), 'RightHand': (-0.10, -0.99, 0.0),
    'LeftShoulder': (0.90, -0.20, 0.0), 'LeftArm': (0.55, 0.80, -0.20), 'LeftForeArm': ((0.20, 0.97, -0.10), 0.0, ((0, 0, 1), (0.3, 0.0, -0.95))), 'LeftHand': (0.10, 0.99, -0.05),
    'LeftUpLeg': (0.28, 0.95, -0.10), 'LeftLeg': (0.10, 0.99, 0.05), 'LeftFoot': (0.15, 0.90, -0.40),
    'RightUpLeg': (-0.40, 0.90, -0.10), 'RightLeg': (0.10, 0.99, 0.05), 'RightFoot': (-0.15, 0.90, -0.40),
}
POSES['headup'] = dict(POSES['prone'], **{   # the same, head lifted off the mud and brought round to the front
    'Spine2': (0, -0.97, 0.22), 'Neck': (0.0, -0.80, 0.60), 'Head': ((0.0, -0.45, 0.89), 0.0, ((0, -1, 0), (-0.25, -0.93, -0.25)))})
POSES['pushup'] = {  # chest off the ground on straight shaking arms, hips still down
    'Hips': (0, -0.95, 0.30), 'Spine': (0, -0.89, 0.45), 'Spine1': (0, -0.81, 0.58), 'Spine2': (0, -0.71, 0.70), 'Neck': (0, -0.62, 0.78), 'Head': (0.0, -0.38, 0.92),
    'LeftShoulder': (0.92, -0.35, -0.10), 'LeftArm': (0.24, -0.34, -0.91), 'LeftForeArm': (0.05, -0.14, -0.99), 'LeftHand': (0.05, -0.95, -0.30),
    'LeftUpLeg': (0.30, 0.90, -0.30), 'LeftLeg': (0.10, 0.99, 0.05), 'LeftFoot': (0.15, 0.90, -0.40),
}
POSES['quad'] = {    # on hands and knees
    'Hips': (0, -0.90, 0.44), 'Spine': (0, -0.92, 0.39), 'Spine1': (0, -0.94, 0.34), 'Spine2': (0, -0.94, 0.33), 'Neck': (0, -0.72, 0.69), 'Head': (0, -0.30, 0.95),
    'LeftShoulder': (0.93, -0.25, -0.26), 'LeftArm': (0.18, -0.22, -0.96), 'LeftForeArm': (0.03, -0.18, -0.98), 'LeftHand': (0.0, -0.80, -0.60),
    'LeftUpLeg': (0.30, -0.42, -0.86), 'LeftLeg': (0.02, 0.93, -0.36), 'LeftFoot': (0.10, 0.85, -0.52),
}
POSES['sit'] = {     # sat back on his haunches, hunched, hands hanging between his knees
    'Hips': (0, 0.20, 0.98), 'Spine': (0, -0.02, 1.0), 'Spine1': (0, -0.20, 0.98), 'Spine2': (0, -0.32, 0.95), 'Neck': (0, -0.45, 0.89), 'Head': (0, -0.18, 0.98),
    'LeftShoulder': (0.92, -0.36, -0.12), 'LeftArm': (0.30, -0.32, -0.90), 'LeftForeArm': (-0.05, -0.62, -0.78), 'LeftHand': (-0.05, -0.75, -0.66),
    'LeftUpLeg': (0.62, -0.74, 0.25), 'LeftLeg': (-0.08, -0.12, -0.99), 'LeftFoot': (0.30, -0.95, -0.08),
}
# ---- on his feet, and up to the branch
POSES['stand'] = {   # upright the way a chimp stands: knees and hips bent, back sloping, arms hanging long
    'Hips': (0, -0.20, 0.98), 'Spine': (0, -0.26, 0.97), 'Spine1': (0, -0.32, 0.95), 'Spine2': (0, -0.36, 0.93), 'Neck': (0, -0.30, 0.95), 'Head': (0, -0.05, 1.0),
    'LeftShoulder': (0.93, -0.30, -0.20), 'LeftArm': (0.22, -0.10, -0.97), 'LeftForeArm': (0.10, -0.28, -0.95), 'LeftHand': (0.05, -0.30, -0.95),
    'LeftUpLeg': (0.22, -0.35, -0.91), 'LeftLeg': (0.02, 0.30, -0.95), 'LeftFoot': (0.20, -0.97, -0.12), 'LeftToeBase': (0.2, -0.98, 0.0),
}
POSES['lookup'] = dict(POSES['stand'], **{   # head thrown back, staring up into the roof of the wood (up and to his left, where the light is)
    'Spine2': (0, -0.22, 0.975), 'Neck': (0, 0.05, 1.0), 'Head': ((0.05, 0.42, 0.90), 0.0, ((0, -1, 0), (0.30, -0.62, 0.72)))})
POSES['crouch'] = {  # coiled to jump: folded deep, arms swung back, eyes on the branch
    'Hips': (0, -0.48, 0.88), 'Spine': (0, -0.56, 0.83), 'Spine1': (0, -0.62, 0.78), 'Spine2': (0, -0.64, 0.77), 'Neck': (0, -0.20, 0.98), 'Head': ((0, 0.25, 0.97), 0.0, ((0, -1, 0), (0.0, -0.70, 0.71))),
    'LeftShoulder': (0.93, -0.20, -0.30), 'LeftArm': (0.25, 0.50, -0.83), 'LeftForeArm': (0.15, 0.22, -0.96), 'LeftHand': (0.1, 0.1, -0.99),
    'LeftUpLeg': (0.30, -0.82, -0.49), 'LeftLeg': (0.0, 0.58, -0.81), 'LeftFoot': (0.20, -0.97, -0.12), 'LeftToeBase': (0.2, -0.98, 0.0),
}
POSES['leap'] = {    # off the ground, everything stretched up at the branch
    'Hips': (0, -0.05, 1.0), 'Spine': (0, -0.03, 1.0), 'Spine1': (0, 0.0, 1.0), 'Spine2': (0, 0.03, 1.0), 'Neck': (0, 0.10, 0.99), 'Head': ((0, 0.30, 0.95), 0.0, ((0, -1, 0), (0.0, -0.60, 0.80))),
    'LeftShoulder': (0.78, -0.10, 0.62), 'LeftArm': (0.20, -0.22, 0.95), 'LeftForeArm': (0.04, -0.16, 0.99), 'LeftHand': (0.0, -0.45, 0.89),
    'LeftUpLeg': (0.15, -0.12, -0.98), 'LeftLeg': (0.05, 0.25, -0.97), 'LeftFoot': (0.10, -0.50, -0.86),
}
POSES['hang'] = {    # hanging from the branch by both hands, arms straight, knees a little drawn up
    'Hips': (0, 0.0, 1.0), 'Spine': (0, 0.0, 1.0), 'Spine1': (0, 0.02, 1.0), 'Spine2': (0, 0.04, 1.0), 'Neck': (0, -0.12, 0.99), 'Head': (0, -0.10, 1.0),
    'LeftShoulder': (0.74, 0.0, 0.67), 'LeftArm': (0.17, -0.05, 0.98), 'LeftForeArm': (0.03, -0.05, 1.0), 'LeftHand': (0.0, -0.80, 0.60),
    'LeftUpLeg': (0.25, -0.45, -0.86), 'LeftLeg': (0.0, 0.50, -0.87), 'LeftFoot': (0.10, -0.60, -0.80),
}
POSES['hanglook'] = dict(POSES['hang'], **{   # ...and he has turned his head: the thing in his left forearm is a hand's width from his eyes
    'Neck': (0.06, -0.10, 0.99), 'Head': ((0.14, -0.05, 0.99), 0.0, ((0, -1, 0), (0.80, -0.52, 0.30))),
    'LeftForeArm': ((0.03, -0.05, 1.0), 0.0, ((0, 0, 1), (-0.62, -0.78, 0.05))), 'RightForeArm': (-0.03, -0.05, 1.0)})
POSES['hang1'] = dict(POSES['hang'], **{   # caught it with the right hand only: the left is still coming up for the branch
    'Spine2': (0.03, 0.04, 1.0), 'Neck': (0.02, 0.05, 1.0), 'Head': ((0.03, 0.22, 0.975), 0.0, ((0, -1, 0), (0.10, -0.50, 0.86))),
    'LeftShoulder': (0.80, -0.20, 0.56), 'LeftArm': (0.42, -0.45, 0.79), 'LeftForeArm': ((0.05, -0.35, 0.94), 0.0, ((0, 0, 1), (-0.30, -0.80, 0.50))), 'LeftHand': (0.0, -0.45, 0.89),
    'RightShoulder': (-0.74, 0.0, 0.67), 'RightArm': (-0.12, -0.05, 0.99), 'RightForeArm': (-0.02, -0.05, 1.0), 'RightHand': (0.0, -0.80, 0.60)})
POSES['hang1look'] = dict(POSES['hang1'], **{   # ...and it never gets there. He has stopped with the forearm in front of his face, staring at what is in it
    'Neck': (0.03, -0.30, 0.95), 'Head': ((0.08, -0.42, 0.90), 0.0, ((0, -1, 0), (0.12, -0.80, -0.58))),
    'LeftShoulder': (0.90, -0.40, 0.10), 'LeftArm': (0.52, -0.66, -0.54), 'LeftForeArm': ((-0.86, -0.42, 0.28), 0.0, ((0, 0, 1), (0.15, -0.62, 0.77))), 'LeftHand': ((-0.92, -0.36, 0.12), 0.0, ((0, 0, 1), (0.15, -0.62, 0.77)))})
POSES['pullup'] = {  # hauling himself up: elbows bent hard, chin over the branch, knees tucked
    'Hips': (0, -0.10, 0.99), 'Spine': (0, -0.05, 1.0), 'Spine1': (0, 0.0, 1.0), 'Spine2': (0, 0.05, 1.0), 'Neck': (0, -0.15, 0.99), 'Head': (0, -0.20, 0.98),
    'LeftShoulder': (0.90, 0.0, 0.42), 'LeftArm': (0.62, -0.10, -0.78), 'LeftForeArm': (-0.28, -0.22, 0.93), 'LeftHand': (0.0, -0.80, 0.60),
    'LeftUpLeg': (0.32, -0.78, -0.54), 'LeftLeg': (0.0, 0.40, -0.92), 'LeftFoot': (0.10, -0.60, -0.80),
}
POSES['perch'] = {   # sat on the branch, legs hanging, hunched over the forearm he holds across himself; the other hand on the bark beside him
    'Hips': (0, 0.15, 0.99), 'Spine': (0, -0.05, 1.0), 'Spine1': (0, -0.25, 0.97), 'Spine2': (0, -0.38, 0.93), 'Neck': (0.03, -0.52, 0.85), 'Head': (0.08, -0.55, 0.83),
    'LeftShoulder': (0.90, -0.42, 0.02), 'LeftArm': (0.36, -0.52, -0.78), 'LeftForeArm': ((-0.80, -0.58, 0.14), 0.0, ((0, 0, 1), (0.30, -0.50, 0.81))), 'LeftHand': ((-0.86, -0.50, -0.08), 0.0, ((0, 0, 1), (0.3, -0.5, 0.81))),
    'RightShoulder': (-0.92, -0.30, -0.20), 'RightArm': (-0.42, 0.05, -0.91), 'RightForeArm': (-0.12, 0.10, -0.99), 'RightHand': (-0.55, -0.30, -0.78),
    'LeftUpLeg': (0.40, -0.86, -0.32), 'LeftLeg': (0.0, 0.24, -0.97), 'LeftFoot': (0.12, -0.75, -0.65),
}
CURL = {'prone': (0.5, 0.7, 0.5), 'headup': (0.5, 0.7, 0.5), 'pushup': (0.15, 0.2, 0.15), 'quad': (0.8, 1.3, 1.0), 'sit': (0.5, 0.7, 0.5), 'knuckle': (0.9, 1.5, 1.2), 'arm': (0.35, 0.5, 0.4), 'look': (0.45, 0.6, 0.5), 'study': (0.4, 0.55, 0.45),
        'stand': (0.45, 0.6, 0.45), 'lookup': (0.45, 0.6, 0.45), 'crouch': (0.6, 0.8, 0.6), 'leap': (0.1, 0.25, 0.2), 'hang': (1.0, 1.45, 1.1), 'hanglook': (1.0, 1.45, 1.1), 'hang1': (1.0, 1.45, 1.1), 'hang1look': (1.0, 1.45, 1.1), 'pullup': (1.0, 1.45, 1.1), 'perch': (0.45, 0.6, 0.5)}       # how far each finger joint curls (radians)


def apply(seven, name):
    import bpy
    from mathutils import Quaternion
    S.pose(seven, POSES[name]); arm = seven['arm']; c = CURL.get(name)
    if c:
        for side in ('Left', 'Right'):
            for f in ('Index', 'Middle', 'Ring', 'Pinky'):
                for j, a in enumerate(c, 1):
                    pb = arm.pose.bones[f'{side}Hand{f}{j}']; pb.rotation_mode = 'QUATERNION'; axis = _curl_axis(arm, pb); pb.rotation_quaternion = Quaternion(axis, a)
        bpy.context.view_layer.update()


def _curl_axis(arm, pb):
    """The axis, in the bone's own space, that bends a finger toward the palm (the palm faces -Z in the T-pose rest)."""
    from mathutils import Vector
    rest = pb.bone.matrix_local.to_3x3(); y = rest @ Vector((0, 1, 0)); axis_world = y.cross(Vector((0, 0, -1)))       # bend the tip toward -Z
    return (rest.inverted() @ axis_world).normalized()

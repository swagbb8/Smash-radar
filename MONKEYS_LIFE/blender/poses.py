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
POSES['prone'] = {   # face down where he fell, head turned to his left, right hand up by his face, left arm (the one with the device) trailing back under the mud
    'Hips': (0, -1, 0.03), 'Spine': (0, -1, 0.02), 'Spine1': (0, -1, 0.04), 'Spine2': (0, -0.99, 0.10), 'Neck': (0.10, -0.97, 0.18),
    'Head': ((0.20, -0.95, 0.22), 0.0, ((0, -1, 0), (1.0, -0.15, 0.25))),
    'RightShoulder': (-0.85, -0.50, 0.0), 'RightArm': (-0.70, -0.70, -0.10), 'RightForeArm': (0.25, -0.96, -0.05), 'RightHand': (0.35, -0.93, 0.0),
    'LeftShoulder': (0.90, -0.20, 0.0), 'LeftArm': (0.55, 0.80, -0.20), 'LeftForeArm': ((0.20, 0.97, -0.10), 0.0, ((0, 0, 1), (0.3, 0.0, -0.95))), 'LeftHand': (0.10, 0.99, -0.05),
    'LeftUpLeg': (0.28, 0.95, -0.10), 'LeftLeg': (0.10, 0.99, 0.05), 'LeftFoot': (0.15, 0.90, -0.40),
    'RightUpLeg': (-0.40, 0.90, -0.10), 'RightLeg': (0.10, 0.99, 0.05), 'RightFoot': (-0.15, 0.90, -0.40),
}
POSES['headup'] = dict(POSES['prone'], **{   # the same, head lifted off the mud and brought round to the front
    'Spine2': (0, -0.97, 0.22), 'Neck': (0.04, -0.80, 0.60), 'Head': ((0.05, -0.45, 0.89), 0.0, ((0, -1, 0), (0.35, -0.90, -0.2)))})
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
CURL = {'prone': (0.5, 0.7, 0.5), 'headup': (0.5, 0.7, 0.5), 'pushup': (0.15, 0.2, 0.15), 'quad': (0.8, 1.3, 1.0), 'sit': (0.5, 0.7, 0.5), 'knuckle': (0.9, 1.5, 1.2), 'arm': (0.35, 0.5, 0.4), 'look': (0.45, 0.6, 0.5), 'study': (0.4, 0.55, 0.45)}       # how far each finger joint curls (radians)


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

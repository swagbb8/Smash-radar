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
CURL = {'knuckle': (0.9, 1.5, 1.2), 'arm': (0.35, 0.5, 0.4)}       # how far each finger joint curls (radians)


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

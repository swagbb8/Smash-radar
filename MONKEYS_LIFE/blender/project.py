"""Shots seen through his eyes. No swamp is loaded here: the frames are a plate (rendered once by render.py) looked at
by a camera that turns, which costs about a second a frame however rich the plate was.

    pj = Projector((1280, 536))
    pj.pano(plate_exr, lon=(-112, 112), lat=(-32, 46))          # a panorama plate (degrees left/right and down/up of straight ahead)
    pj.focus([exr, exr, ...], lens=15.0, aspect=w / h)          # plates from one camera, each focused further away
    pj.render(path, view(t), view(t + 1/24))                    # view = dict(yaw, pitch, roll, lens[, focus]); two of them give motion blur

Inside, the plate is the scene's sky: every camera ray is turned into a place on the plate by the world shader.
Straight ahead on the plate is +Y, its right is +X, up is +Z.
"""
import math, os, sys
import bpy
from mathutils import Quaternion, Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import finish
from seven import NT


class Projector:
    def __init__(self, size=(1280, 536), samples=24, bloom=0.3):
        bpy.ops.wm.read_factory_settings(use_empty=True); sc = self.sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_adaptive_sampling = False; sc.cycles.use_denoising = False
        sc.render.resolution_x, sc.render.resolution_y = size; sc.render.film_transparent = False; sc.view_settings.view_transform = 'AgX'
        looks = [l.name for l in bpy.types.ColorManagedViewSettings.bl_rna.properties['look'].enum_items]; sc.view_settings.look = 'AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in looks else 'None'
        cd = bpy.data.cameras.new('Eye'); cd.sensor_width = 36; self.cam = bpy.data.objects.new('Eye', cd); sc.collection.objects.link(self.cam); sc.camera = self.cam; self.cam.rotation_mode = 'QUATERNION'
        w = bpy.data.worlds.new('Plate'); w.use_nodes = True; sc.world = w; self.T = NT(w.node_tree); self.bg = w.node_tree.nodes['Background']; self.bg.inputs['Strength'].default_value = 1.0
        sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = 0.5; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'; sc.render.image_settings.color_mode = 'RGB'
        finish.simple(sc, bloom); self.focus_value = None

    def _dir(self):
        T = self.T; d = T.node('ShaderNodeVectorMath', operation='NORMALIZE'); T.link(T.node('ShaderNodeTexCoord').outputs['Generated'], d.inputs[0]); s = T.node('ShaderNodeSeparateXYZ'); T.link(d.outputs['Vector'], s.inputs[0]); return s.outputs

    def _image(self, path, u, v):
        T = self.T; c = T.node('ShaderNodeCombineXYZ'); T.link(u, c.inputs['X']); T.link(v, c.inputs['Y']); n = T.node('ShaderNodeTexImage'); n.image = bpy.data.images.load(path, check_existing=True); n.extension = 'CLIP'; n.interpolation = 'Cubic'
        T.link(c.outputs[0], n.inputs['Vector']); return n.outputs['Color']

    def pano(self, plate, lon, lat):
        T = self.T; o = self._dir(); l0, l1 = math.radians(lon[0]), math.radians(lon[1]); b0, b1 = math.radians(lat[0]), math.radians(lat[1])
        u = T.math('DIVIDE', T.math('SUBTRACT', T.math('ARCTAN2', o['X'], o['Y']), l0), l1 - l0); v = T.math('DIVIDE', T.math('SUBTRACT', T.math('ARCSINE', o['Z']), b0), b1 - b0)
        T.link(self._image(plate, u, v), self.bg.inputs['Color'])

    def focus(self, plates, lens, aspect):
        """plates: EXRs from one camera (focal length `lens` mm on a 36 mm sensor, width / height = aspect), each focused further off."""
        T = self.T; o = self._dir(); k = lens / 36.0; y = T.math('MAXIMUM', o['Y'], 1e-4); u = T.math('ADD', T.math('MULTIPLY', T.math('DIVIDE', o['X'], y), k), 0.5); v = T.math('ADD', T.math('MULTIPLY', T.math('DIVIDE', o['Z'], y), k * aspect), 0.5)
        f = T.node('ShaderNodeValue'); f.name = 'Focus'; f.outputs[0].default_value = 0.0; self.focus_value = f.outputs[0]; total = None
        for i, p in enumerate(plates):
            w = T.math('SUBTRACT', 1.0, T.math('ABSOLUTE', T.math('SUBTRACT', f.outputs[0], float(i))), clamp=True); c = T.node('ShaderNodeVectorMath', operation='SCALE'); T.link(self._image(p, u, v), c.inputs[0]); T.link(w, c.inputs['Scale'])
            if total is None: total = c.outputs['Vector']
            else: a = T.node('ShaderNodeVectorMath', operation='ADD'); T.link(total, a.inputs[0]); T.link(c.outputs['Vector'], a.inputs[1]); total = a.outputs['Vector']
        front = T.node('ShaderNodeVectorMath', operation='SCALE'); T.link(total, front.inputs[0]); T.link(T.math('GREATER_THAN', o['Y'], 0.0), front.inputs['Scale']); T.link(front.outputs['Vector'], self.bg.inputs['Color'])

    @staticmethod
    def _quat(v):
        base = Vector((0, 1, 0)).to_track_quat('-Z', 'Y')                                   # looking along +Y, +Z up
        return Quaternion((0, 0, 1), -math.radians(v['yaw'])) @ base @ Quaternion((1, 0, 0), math.radians(v['pitch'])) @ Quaternion((0, 0, 1), math.radians(v.get('roll', 0.0)))

    def render(self, path, view, view_next=None, frame=1):
        """One frame. view_next = the view a frame later: the shutter stays open for half the time between, so quick glances smear."""
        sc = self.sc; cam = self.cam; cam.animation_data_clear(); cam.data.animation_data_clear(); sc.frame_set(frame); cam.data.lens = view['lens']
        if self.focus_value is not None: self.focus_value.default_value = view.get('focus', 0.0)
        for f, v in ((frame, view), (frame + 1, view_next or view)): cam.rotation_quaternion = self._quat(v); cam.keyframe_insert('rotation_quaternion', frame=f)
        if cam.animation_data and cam.animation_data.action:
            for fc in getattr(cam.animation_data.action, 'fcurves', []):
                for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
        sc.frame_set(frame); sc.render.filepath = path; bpy.ops.render.render(write_still=True)

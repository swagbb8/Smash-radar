"""Finishing inside Blender's compositor.

OpenImageDenoise cleans skin, water and fog well but smears fur into paint. So the frame is denoised everywhere except
on the fur, where the raw render is kept (its fine noise reads as hair texture); a soft bloom is added on top.
"""
import bpy

FUR_INDEX = 7           # object pass index given to every hair object


def setup(sc, bloom=0.0, fur_raw=0.85, plate=None):
    """Build the compositing tree. fur_raw: how much of the un-denoised image to keep on fur (0 = fully denoised).
    plate: path of an EXR of the scenery; the render (transparent film) is laid over it in linear light."""
    vl = bpy.context.view_layer; vl.use_pass_object_index = True; vl.cycles.denoising_store_passes = True; sc.cycles.use_denoising = True
    old = sc.compositing_node_group
    tree = bpy.data.node_groups.new('Finish', 'CompositorNodeTree'); sc.compositing_node_group = tree; sc.render.use_compositing = True
    if old is not None and old.users == 0: bpy.data.node_groups.remove(old)
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor'); N = tree.nodes; L = tree.links.new
    rl = N.new('CompositorNodeRLayers'); out = N.new('NodeGroupOutput')
    idm = N.new('CompositorNodeIDMask'); idm.inputs['Index'].default_value = FUR_INDEX; idm.inputs['Anti-Alias'].default_value = True; L(rl.outputs['Object Index'], idm.inputs['ID value'])
    amt = N.new('ShaderNodeMath'); amt.operation = 'MULTIPLY'; amt.inputs[1].default_value = fur_raw; L(idm.outputs[0], amt.inputs[0])
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; L(amt.outputs[0], mix.inputs[0]); L(rl.outputs['Image'], mix.inputs[6]); L(rl.outputs['Noisy Image'], mix.inputs[7]); img = mix.outputs[2]
    if plate:
        im = N.new('CompositorNodeImage'); im.image = bpy.data.images.load(plate, check_existing=False); sa = N.new('CompositorNodeSetAlpha'); L(img, sa.inputs['Image']); L(rl.outputs['Alpha'], sa.inputs['Alpha'])
        try: sa.inputs['Type'].default_value = 'Replace Alpha'
        except Exception:
            try: sa.mode = 'REPLACE_ALPHA'
            except Exception: pass
        ao = N.new('CompositorNodeAlphaOver'); bg_in = ao.inputs['Background'] if 'Background' in ao.inputs else ao.inputs[1]; fg_in = ao.inputs['Foreground'] if 'Foreground' in ao.inputs else ao.inputs[2]
        L(im.outputs['Image'], bg_in); L(sa.outputs['Image'], fg_in); img = ao.outputs['Image']
    if bloom > 0: img = _bloom(N, L, img, bloom)
    L(img, out.inputs[0]); return tree


def simple(sc, bloom=0.0):
    """For frames with no fur and no noise to speak of (plates looked at again): just the bloom."""
    tree = bpy.data.node_groups.new('FinishSimple', 'CompositorNodeTree'); sc.compositing_node_group = tree; sc.render.use_compositing = True
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor'); N = tree.nodes; L = tree.links.new; rl = N.new('CompositorNodeRLayers'); out = N.new('NodeGroupOutput'); img = rl.outputs['Image']
    if bloom > 0: img = _bloom(N, L, img, bloom)
    L(img, out.inputs[0]); return tree


def _bloom(N, L, img, bloom, threshold=1.4):
    g = N.new('CompositorNodeGlare'); L(img, g.inputs['Image'])
    for k, v in (('Type', 'Bloom'), ('Quality', 'High')):
        try: g.inputs[k].default_value = v
        except Exception: pass
    for k, v in (('Threshold', threshold), ('Strength', bloom), ('Size', 0.55), ('Saturation', 1.0)):
        if k in g.inputs: g.inputs[k].default_value = v
    return g.outputs['Image']


def mark_fur(*objects):
    for o in objects:
        if o is not None: o.pass_index = FUR_INDEX

"""CC0 scene assets from Poly Haven. The "Monkey assets" workflow keeps them on the branch `monkey-assets`; clone that branch
into MONKEYS_LIFE/assets/scene (the render workflows do it, see NOTES.md) and everything here finds them by id.
"""
import glob, os
import bpy
import basemesh as bm

DIR = os.path.join(bm.ROOT, 'assets', 'scene')
_seen = {}


def path(asset, ext='blend'):
    p = os.path.join(DIR, asset, f'{asset}.{ext}')
    if not os.path.exists(p):
        parts = sorted(glob.glob(p + '.part-*'))                        # big files are kept in parts (GitHub's size limit)
        if parts:
            with open(p, 'wb') as out:
                for q in parts: out.write(open(q, 'rb').read())
        else: raise FileNotFoundError(f'scene asset missing: {p} (clone the monkey-assets branch into {DIR})')
    return p


def objects(asset, pick=None):
    """Append objects from an asset file (they are not put in the scene). pick(name) -> keep? ; -> {name: object}"""
    with bpy.data.libraries.load(path(asset), link=False) as (src, dst): dst.objects = [n for n in src.objects if pick is None or pick(n)]
    return {o.name: o for o in dst.objects if o is not None}


def material(asset, name=None, box=None, bump_only=True):
    """A Poly Haven material. box = size in metres of one repeat: map it by box projection in object space (no UVs needed)."""
    key = (asset, name, box)
    if key in _seen: return _seen[key]
    with bpy.data.libraries.load(path(asset), link=False) as (src, dst): dst.materials = [name or asset]
    m = dst.materials[0]
    if box:
        m = m.copy(); m.name = f'{name or asset}_box{box}'; nt = m.node_tree; tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / box, 1 / box, 1 / box)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        for n in nt.nodes:
            if n.bl_idname == 'ShaderNodeTexImage': n.projection = 'BOX'; n.projection_blend = 0.25; nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    if bump_only: m.displacement_method = 'BUMP'
    _seen[key] = m; return m


def images(asset):
    """-> {'diff': path, 'nor': path, 'rough': path, 'disp': path, 'alpha': path} for a texture set, whichever exist"""
    out = {}
    for f in sorted(glob.glob(os.path.join(DIR, asset, 'textures', '*'))):
        low = os.path.basename(f).lower()
        for k in ('diff', 'nor_gl', 'rough', 'disp', 'alpha'):
            if f'_{k}_' in low and k.split('_')[0] not in out: out[k.split('_')[0]] = f
    return out


def hdri(asset): return path(asset, 'hdr')

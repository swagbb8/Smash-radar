"""Water that reacts: drops thrown up when something hits the pool, and rings spreading over it afterwards.

    sp = Splash(scene, collection)        # the collection Seven is in, so drops are part of the character pass
    sp.burst(t0, (x, y), power=1.0)       # something hits the water at time t0 (seconds) -- call once per hit, in setup
    sp.frame(t)                           # every frame: places the drops, drives the rings (swamp.ripple_field)
"""
import math
import bpy
import numpy as np
import swamp

G = 9.81


class Splash:
    def __init__(self, sc, coll, n=420, seed=5):
        self.n = n; self.rng = np.random.default_rng(seed); self.bursts = []
        me = bpy.data.meshes.new('Drop'); import bmesh
        bm_ = bmesh.new(); bmesh.ops.create_icosphere(bm_, subdivisions=1, radius=1.0); bm_.to_mesh(me); bm_.free()
        for p_ in me.polygons: p_.use_smooth = True
        m = bpy.data.materials.new('WaterDrop'); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
        p.inputs['Base Color'].default_value = (0.85, 0.92, 0.88, 1); p.inputs['Roughness'].default_value = 0.03; p.inputs['IOR'].default_value = 1.33; p.inputs['Transmission Weight'].default_value = 0.85; me.materials.append(m)
        self.obs = []
        for i in range(n):
            ob = bpy.data.objects.new(f'Drop{i:03d}', me); coll.objects.link(ob); ob.hide_render = True; ob.visible_shadow = False; self.obs.append(ob)
        self.p0 = np.zeros((n, 3)); self.v0 = np.zeros((n, 3)); self.t0 = np.full(n, 1e9); self.size = np.zeros(n); self.used = 0

    def burst(self, t0, xy, power=1.0, count=200, lean=(0.0, 0.0)):
        """Drops for one hit: a crown thrown outward and up, a few flung high. lean = extra sideways throw (m/s)."""
        r = self.rng; i0 = self.used; i1 = min(self.n, i0 + count); k = i1 - i0; self.used = i1
        if k <= 0: return
        ang = r.uniform(0, 2 * math.pi, k); out = r.gamma(2.0, 0.55, k) * power; up = np.abs(r.normal(2.4, 1.1, k)) * power ** 0.5; high = r.random(k) < 0.12; up[high] *= 1.7; out[high] *= 0.4
        rad = r.uniform(0.0, 0.32, k) * power ** 0.5
        self.p0[i0:i1] = np.stack([xy[0] + rad * np.cos(ang), xy[1] + rad * np.sin(ang), np.full(k, 0.01)], 1)
        self.v0[i0:i1] = np.stack([out * np.cos(ang) + lean[0], out * np.sin(ang) + lean[1], up], 1); self.t0[i0:i1] = t0 + r.uniform(0.0, 0.07, k)
        self.size[i0:i1] = np.clip(r.gamma(2.0, 0.006, k), 0.004, 0.035); self.bursts.append((t0, xy, power))

    def frame(self, t):
        for i, ob in enumerate(self.obs[:self.used]):
            tau = t - self.t0[i]
            if tau < 0: ob.hide_render = True; continue
            z = self.p0[i, 2] + self.v0[i, 2] * tau - 0.5 * G * tau * tau
            if z < -0.02: ob.hide_render = True; continue
            ob.hide_render = False; ob.location = (self.p0[i, 0] + self.v0[i, 0] * tau, self.p0[i, 1] + self.v0[i, 1] * tau, z); s_ = self.size[i]; st = 1.0 + min(2.5, abs(self.v0[i, 2] - G * tau) * 0.22)     # stretched along its fall, like a drop caught by a shutter
            ob.scale = (s_, s_, s_ * st)
        last = None
        for b in self.bursts:
            if b[0] <= t: last = b
        if last is None: swamp.set_ripple(None)
        else: swamp.set_ripple(last[1], t - last[0], 1.0 * last[2])

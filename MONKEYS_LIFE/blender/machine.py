"""Which hardware renders. The sandbox and the Linux runners only have processor cores; Apple runners have a graphics
chip Cycles can use through Metal, which is several times faster.

    machine.pick(scene)            # 'auto': the graphics card when there is a usable one, else the processor
    ML_DEVICE=cpu|gpu|auto         # environment override (the workflows set it)
"""
import os
import bpy

KINDS = ('METAL', 'OPTIX', 'CUDA', 'HIP', 'ONEAPI')


def pick(sc, want=None):
    """-> a short description of what will render. want: 'cpu', 'gpu' (fail if there is none) or 'auto'."""
    want = (want or os.environ.get('ML_DEVICE') or 'auto').lower(); sc.cycles.device = 'CPU'
    if want == 'cpu': return f'cpu x{os.cpu_count()}'
    try: prefs = bpy.context.preferences.addons['cycles'].preferences
    except Exception as e:
        if want == 'gpu': raise RuntimeError(f'no Cycles preferences: {e}')
        return f'cpu x{os.cpu_count()}'
    for kind in KINDS:
        try: prefs.compute_device_type = kind
        except Exception: continue
        try: prefs.refresh_devices()
        except Exception:
            try: prefs.get_devices()
            except Exception: pass
        found = [d for d in prefs.devices if d.type == kind]
        if found:
            for d in prefs.devices: d.use = d.type == kind
            sc.cycles.device = 'GPU'; return f'{kind.lower()}: ' + ', '.join(d.name for d in found)
    try: prefs.compute_device_type = 'NONE'
    except Exception: pass
    if want == 'gpu': raise RuntimeError('no graphics card Cycles can use on this machine')
    return f'cpu x{os.cpu_count()}'

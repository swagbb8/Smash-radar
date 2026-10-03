"""Render presets (kept free of Blender imports so job planning can read them)."""
RENDER_PRESETS = {
    #            long side  fps  samples  motion blur  subdiv
    'DRAFT':     (960,      24,  10,      False,       1),
    'PREVIEW':   (1280,     30,  14,      False,       1),
    'STANDARD':  (1920,     30,  32,      True,        2),
    'HIGH':      (1920,     60,  48,      True,        2),
    'CINEMATIC': (2560,     60,  96,      True,        2),
}

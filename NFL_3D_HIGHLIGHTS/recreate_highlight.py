"""python recreate_highlight.py play.json [--preset PREVIEW|HIGH|CINEMATIC] [--aspect 16:9]
Loads the assets, builds stadium + players, simulates the play, generates cameras + replay, renders and encodes the video."""
import os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__)); args = sys.argv[1:]
if not args: sys.exit(__doc__)
play, rest = args[0], args[1:]
if not any(a in rest for a in ('--render', '--preview', '--sheet', '--still', '--info')): rest.append('--render')
sys.exit(subprocess.call([sys.executable, os.path.join(here, 'blender', 'main.py'), '--play', play, *rest]))

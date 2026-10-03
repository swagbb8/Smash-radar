"""Helpers for rendering in parallel on CI (GitHub Actions): `plan` splits the frames into chunks, each `render`
job renders one chunk, `finish` adds graphics + sound and encodes. All inputs arrive as environment variables
(HL_PLAY / HL_TEXT / HL_PRESET / HL_ASPECT / HL_NAME / HL_CHUNKS / HL_RANGE) so free text never touches a shell."""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)


def base_args():
    play, text = os.environ.get('HL_PLAY', '').strip(), os.environ.get('HL_TEXT', '').strip()
    if play:
        play = os.path.basename(play); play = play if play.endswith('.json') else play + '.json'
        args = ['--play', os.path.join(ROOT, 'plays', play)]; name = os.path.splitext(play)[0]
    elif text: args = ['--text', text]; name = re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:48] or 'play'
    else: sys.exit('set HL_PLAY or HL_TEXT')
    name = re.sub(r'[^A-Za-z0-9_-]+', '-', os.environ.get('HL_NAME', '').strip()) or name
    args += ['--name', name, '--preset', os.environ.get('HL_PRESET') or 'PREVIEW', '--aspect', os.environ.get('HL_ASPECT') or '9:16']
    for env, flag in (('HL_LIGHTING', '--lighting'), ('HL_WEATHER', '--weather'), ('HL_CAMERA', '--camera')):
        if os.environ.get(env): args += [flag, os.environ[env]]
    return args, name


def run(extra): return subprocess.run([sys.executable, os.path.join(HERE, 'main.py'), *extra], check=True, text=True, capture_output='--info' in extra)


def plan():
    args, name = base_args(); out = run(args + ['--info']).stdout; print(out)
    frames = int(re.search(r'FRAMES=(\d+)', out).group(1)); chunks = max(1, min(int(os.environ.get('HL_CHUNKS') or 10), 20, frames // 12 or 1)); size = -(-frames // chunks)
    matrix = {'include': [{'chunk': i, 'range': f'{1 + i * size}:{min(frames, (i + 1) * size)}'} for i in range(chunks) if 1 + i * size <= frames]}
    with open(os.environ.get('GITHUB_OUTPUT', '/dev/stdout'), 'a') as f: f.write(f'matrix={json.dumps(matrix)}\nname={name}\nframes={frames}\n')


def render():
    args, name = base_args(); run(args + ['--render', '--frames', os.environ['HL_RANGE']])


def finish():
    args, name = base_args(); run(['--name', name, '--finish'] + args[:2])
    print(os.path.join(ROOT, 'renders', name, f'{name}.mp4'))


if __name__ == '__main__': {'plan': plan, 'render': render, 'finish': finish}[sys.argv[1]]()

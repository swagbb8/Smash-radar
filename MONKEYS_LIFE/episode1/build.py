"""Build Episode 1 for the AI video route.

    python build.py [out_dir]      -> ep1.json (for the page), ep1_prompts.txt, ep1_magiclight.txt + a timing report
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from ep import NAME, prompt, make_len                                                     # noqa: E402
import scenes_a, scenes_b, scenes_c, scenes_d                                             # noqa: E402

SCENES = scenes_a.SCENES + scenes_b.SCENES + scenes_c.SCENES + scenes_d.SCENES


def mmss(s): return f'{int(s) // 60}:{int(s) % 60:02d}'


def episode():
    out = []; t = 0; n = 0
    for k, sc in enumerate(SCENES):
        shots = []; t0 = t
        for s in sc['shots']:
            item = dict(sec=s['sec'], what=s['what'], kind=s['kind'], lines=s['lines'], his=s['his'],
                        who=[NAME[c] for c in s['who']], at=mmss(t))
            if s['kind'] != 'mine':
                n += 1; item.update(n=n, make=make_len(s['sec']), prompt=prompt(s, sc))
            shots.append(item); t += s['sec']
        out.append(dict(k=k, title=sc['title'], when=sc['when'], new=sc['new'], note=sc['note'], summary=sc['summary'],
                        start=mmss(t0), length=mmss(t - t0), secs=t - t0, shots=shots))
    return out, t, n


def main():
    dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out'); os.makedirs(dst, exist_ok=True)
    eps, total, n = episode()
    json.dump(dict(scenes=eps, total=mmss(total), secs=total, clips=n), open(os.path.join(dst, 'ep1.json'), 'w'),
              ensure_ascii=False, indent=1)
    with open(os.path.join(dst, 'ep1_prompts.txt'), 'w') as f:
        f.write(f"MONKEY'S LIFE — Episode 1 \"ARISE\" — {n} clips, about {mmss(total)}\n\n")
        for sc in eps:
            f.write(f"=== {sc['title'].upper()} ({sc['when']}, {sc['length']})" + ('  [NEW]' if sc['new'] else '') + ' ===\n\n')
            for s in sc['shots']:
                if s['kind'] == 'mine': f.write(f"[made in the edit] {s['what']}\n\n"); continue
                f.write(f"#{s['n']:03d}  {s['make']} s  — {s['what']}\n{s['prompt']}\n")
                for who, line in s['lines']: f.write(f"   {who}: {line}\n")
                f.write('\n')
    with open(os.path.join(dst, 'ep1_magiclight.txt'), 'w') as f:
        f.write("MONKEY'S LIFE — Episode 1: ARISE\n\nSTYLE: Photorealistic, live-action nature-documentary realism. "
                "Ancient jungle Earth, no humans. Adult dark sci-fi mystery comedy.\n\nCHARACTERS:\n")
        from ep import CHAR, LOOK
        for c in 'SGPD': f.write('- ' + CHAR[c].format(look=LOOK['dry']) + '\n')
        f.write("The chimps speak in grunts and hoots (subtitled). Seven's only English words are spoken.\n\n")
        for i, sc in enumerate(eps, 1):
            f.write(f"SCENE {i} — {sc['title'].upper()} ({sc['when']})\n[VISUAL] {sc['summary']}\n")
            for s in sc['shots']:
                for who, line in s['lines']:
                    f.write(f"{'ON SCREEN' if who == 'CAP' else who}: {line}\n")
            f.write('\n')
    print(f'{n} clips, {mmss(total)} total')
    for sc in eps:
        made = sum(s['make'] for s in sc['shots'] if s['kind'] != 'mine')
        print(f"  {sc['start']:>6}  {sc['length']:>5}  {sc['title']:<22} {len([s for s in sc['shots'] if s['kind'] != 'mine']):3d} clips"
              f"  ({made} s to generate){'  NEW' if sc['new'] else ''}")
    longest = max((s for sc in eps for s in sc['shots'] if s['kind'] != 'mine'), key=lambda s: len(s['prompt']))
    print('longest prompt', len(longest['prompt']), 'chars (#%d)' % longest['n'])


if __name__ == '__main__': main()

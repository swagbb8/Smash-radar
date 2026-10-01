"""Background worker: make a recap video for every finished NFL game, keep each one forever (GitHub Release
'nfl-recaps'), and leave a record for the site. Started by build-static.js; runs while the loop sleeps."""
import glob, json, os, shutil, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import archive

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.environ.get('RECAP_DIR', '/tmp/smash-recaps')
for d in ('specs', 'done', 'failed', 'out'):
    os.makedirs(os.path.join(WORK, d), exist_ok=True)


def release(tag='nfl-recaps'):
    try:
        return archive.call('GET', f'{archive.API}/repos/{archive.REPO}/releases/tags/{tag}')
    except Exception:
        return archive.call('POST', f'{archive.API}/repos/{archive.REPO}/releases', {
            'tag_name': tag, 'target_commitish': 'main', 'name': 'SMASH NEWS — NFL game recaps',
            'body': 'Every NFL game recap made by SMASH NEWS, saved automatically.', 'prerelease': True})


def main(nfl_json, done_json):
    subprocess.run(['node', 'scripts/nfl-recaps.mjs', nfl_json, done_json, os.path.join(WORK, 'specs'), os.environ.get('RECAPS_PER_RUN', '3')], cwd=ROOT)
    for spec_path in sorted(glob.glob(os.path.join(WORK, 'specs', '*.json'))):
        spec = json.load(open(spec_path))
        gid = spec['id']
        out = os.path.join(WORK, 'out', f'{gid}.mp4')
        try:
            subprocess.run(['python3', 'scripts/recap_video.py', spec_path, out], cwd=ROOT, check=True, timeout=1500)
        except Exception as e:
            print(f'recap {gid} failed: {e}', file=sys.stderr)
            shutil.move(spec_path, os.path.join(WORK, 'failed', f'{gid}.json'))
            continue
        url = None
        if archive.TOKEN and archive.REPO:
            try:
                slug = f"nfl-recap-week{spec.get('week') or ''}-{spec['away']['abbr']}-at-{spec['home']['abbr']}-{gid}.mp4".lower()
                url = archive.upload(release(), out, slug, 'video/mp4')
            except Exception as e:
                print(f'recap {gid} upload failed: {e}', file=sys.stderr)
        fz_url, fz_file = None, None
        try:  # fantasy showdown video for the same game (real ESPN PPR points)
            g = next((x for x in json.load(open(nfl_json))['games'] if str(x['id']) == gid), None)
            if g and g.get('fantasy'):
                fz_out = os.path.join(WORK, 'out', f'{gid}-fantasy.mp4')
                subprocess.run(['python3', 'scripts/fantasy_video.py', nfl_json, gid, fz_out], cwd=ROOT, check=True, timeout=900)
                fz_file = f'{gid}-fantasy.mp4'
                if archive.TOKEN and archive.REPO:
                    fz_url = archive.upload(release(), fz_out, f"nfl-fantasy-week{spec.get('week') or ''}-{spec['away']['abbr']}-at-{spec['home']['abbr']}-{gid}.mp4".lower(), 'video/mp4')
        except Exception as e:
            print(f'fantasy video {gid} failed: {e}', file=sys.stderr)
        side = lambda k: {x: spec[k].get(x) for x in ('abbr', 'name', 'full', 'score', 'logo', 'color')}
        rec = {'id': gid, 'title': spec['title'], 'week': spec.get('week'), 'date': spec.get('date'), 'away': side('away'), 'home': side('home'),
               'winner': spec.get('winner'), 'video': url, 'file': f'{gid}.mp4', 'bytes': os.path.getsize(out), 'madeAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               'playCount': len(spec.get('plays', [])), 'plays': spec.get('plays', []), 'leaders': spec.get('leaders', []), 'stats': spec.get('stats'), 'fantasyVideo': fz_url, 'fantasyFile': fz_file}
        with open(os.path.join(WORK, 'new.jsonl'), 'a') as f:
            f.write(json.dumps(rec) + '\n')
        shutil.move(spec_path, os.path.join(WORK, 'done', f'{gid}.json'))
        print(f'recap done: {spec["title"]}')


if __name__ == '__main__':
    lock = os.path.join(WORK, 'running.lock')
    try:
        main(sys.argv[1], sys.argv[2])
    finally:
        try: os.remove(lock)
        except OSError: pass

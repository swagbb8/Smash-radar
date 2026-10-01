"""Keep every SMASH NEWS show forever: upload the show's MP4 + script to a GitHub Release (one release per day).
Usage: python3 scripts/archive.py <show.mp4> <script.txt> <show.json> <records.jsonl>
Needs GITHUB_TOKEN + GITHUB_REPOSITORY (both are set automatically inside GitHub Actions)."""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

TOKEN = os.environ.get('GITHUB_TOKEN')
REPO = os.environ.get('GITHUB_REPOSITORY')
API = 'https://api.github.com'


def call(method, url, data=None, ctype='application/json'):
    body = json.dumps(data).encode() if isinstance(data, dict) else data
    req = urllib.request.Request(url, data=body, method=method, headers={
        'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json', 'Content-Type': ctype,
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'smash-news-bot'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read() or b'{}')


def release_for(day):
    tag = f'shows-{day}'
    try:
        return call('GET', f'{API}/repos/{REPO}/releases/tags/{tag}')
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
    return call('POST', f'{API}/repos/{REPO}/releases', {
        'tag_name': tag, 'target_commitish': 'main', 'name': f'SMASH NEWS shows — {day}',
        'body': f'Every SMASH NEWS show from {day} (Central time): video + script. Saved automatically.', 'prerelease': True})


def upload(rel, path, name, ctype):
    for a in rel.get('assets', []):
        if a['name'] == name:
            return a['browser_download_url']
    url = rel['upload_url'].split('{')[0] + '?' + urllib.parse.urlencode({'name': name})
    for attempt in range(3):
        try:
            return call('POST', url, open(path, 'rb').read(), ctype)['browser_download_url']
        except Exception as e:
            print(f'archive: upload {name} attempt {attempt + 1}: {e}', file=sys.stderr)
            time.sleep(3)
    return None


def main(mp4, txt, show_json, records):
    if not (TOKEN and REPO):
        print('archive: no GitHub token here, skipping'); return
    show = json.load(open(show_json))
    slot = show.get('slot') or show['id']
    base = 'smash-news-' + slot.replace(':', '-').replace('T', '_')
    rel = release_for(slot[:10])
    video = upload(rel, mp4, f'{base}.mp4', 'video/mp4')
    script = upload(rel, txt, f'{base}.txt', 'text/plain') if os.path.exists(txt) else None
    if not video:
        return
    rec = {'slot': slot, 'video': video, 'script': script, 'bytes': os.path.getsize(mp4), 'seconds': show.get('totalSeconds'),
           'startsAt': show.get('startsAt'), 'stories': len([g for g in show['segments'] if g.get('title')]),
           'headlines': [g['title'] for g in show['segments'] if g.get('title')][:3]}
    with open(records, 'a') as f:
        f.write(json.dumps(rec) + '\n')
    print(f'archive: saved {base} forever → {video}')


if __name__ == '__main__':
    main(*sys.argv[1:5])

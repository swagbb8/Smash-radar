"""ESPN-style fantasy matchup video for one NFL game: both teams as fantasy rosters, every player's real
points counting up play by play, totals racing, and a final result. 1080x1920, 30fps, original music.
Usage: python3 scripts/fantasy_video.py <nfl.json> <gameId> <out.mp4>"""
import asyncio, json, math, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recap_video as rv

W, H, FPS = 1080, 1920, 30

PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><style>/*FONTS*/
*{box-sizing:border-box;margin:0;padding:0}html,body{width:1080px;height:1920px;overflow:hidden;background:#07080b;color:#fff;font-family:Oswald,Arial,sans-serif}
#st{position:absolute;inset:0;background:radial-gradient(90% 60% at 50% 0%,rgba(198,255,61,.14),transparent 60%),#07080b}
.top{position:absolute;top:50px;left:54px;right:54px;display:flex;align-items:center;gap:14px;font-weight:700;letter-spacing:.14em;font-size:28px}
.top .lg{width:46px;height:46px;border-radius:50%;border:5px solid #c6ff3d}.top b{font-family:Anton;font-weight:400;font-size:40px;letter-spacing:.05em}.top b em{font-style:normal;color:#c6ff3d}
.top .tag{margin-left:auto;background:#c6ff3d;color:#0b1100;padding:6px 16px;border-radius:6px;font-size:24px}
.ttl{position:absolute;top:130px;left:54px;right:54px}.ttl h1{font-family:Anton;font-weight:400;font-size:96px;line-height:1}.ttl p{font-size:30px;letter-spacing:.16em;color:#9aa3ad;margin-top:8px}
.team{position:absolute;left:40px;right:40px;border-radius:26px;overflow:hidden;background:#101318;border:2px solid rgba(255,255,255,.08)}
.th{display:flex;align-items:center;gap:18px;padding:18px 26px;background:linear-gradient(120deg,var(--c),rgba(0,0,0,.35))}
.th img{width:76px;height:76px;object-fit:contain}.th .n{font-family:Anton;font-size:52px}.th .s{font-size:24px;letter-spacing:.14em;opacity:.85}
.th .tot{margin-left:auto;font-family:Anton;font-size:84px;transition:none}.th .tot.lead{color:#c6ff3d;text-shadow:0 0 30px rgba(198,255,61,.6)}
.row{display:flex;align-items:center;gap:16px;padding:12px 26px;border-top:2px solid rgba(255,255,255,.06);height:84px}
.pos{width:92px;text-align:center;font-weight:700;font-size:22px;border-radius:8px;padding:5px 0;background:#1d222b;color:#c9ced6}
.pos.QB{background:#ff5a7a33;color:#ff8aa0}.pos.RB{background:#22c3ee33;color:#6fdcf5}.pos.WR{background:#c6ff3d26;color:#c6ff3d}.pos.K{background:#8b7dff33;color:#b0a6ff}.pos.DST{background:#ffffff22;color:#fff}
.nm{flex:1;min-width:0}.nm b{display:block;font-size:34px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nm small{display:block;font-size:21px;color:#8a929c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pt{font-family:Anton;font-size:50px;min-width:120px;text-align:right}.row.hit{background:rgba(198,255,61,.16)}.row.hit .pt{color:#c6ff3d}
.tick{position:absolute;left:40px;right:40px;bottom:120px;height:150px;border-radius:22px;background:#c6ff3d;color:#0b1100;padding:18px 28px;display:flex;flex-direction:column;justify-content:center}
.tick small{font-size:24px;font-weight:700;letter-spacing:.16em}.tick b{font-family:Anton;font-weight:400;font-size:44px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{position:absolute;left:40px;right:40px;bottom:80px;height:16px;border-radius:99px;overflow:hidden;background:#1d222b;display:flex}.bar i{display:block;height:100%}
.slam{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:#07080b;z-index:20}
.slam h2{font-family:Anton;font-weight:400;font-size:150px;line-height:.95}.slam h2 em{font-style:normal;color:#c6ff3d}.slam p{font-size:34px;letter-spacing:.2em;color:#c9ced6;margin-top:24px}
.fin{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;text-align:center;background:radial-gradient(80% 60% at 50% 40%,rgba(198,255,61,.25),#07080b 70%)}
.fin h3{font-size:40px;letter-spacing:.22em;color:#c6ff3d}.fin .sc{font-family:Anton;font-size:170px;line-height:1}.fin .sc span{opacity:.5}.fin .mvp{margin-top:20px;padding:20px 34px;border-radius:20px;background:#101318;border:2px solid #c6ff3d}
.fin .mvp b{display:block;font-family:Anton;font-weight:400;font-size:70px}.fin .mvp small{font-size:28px;letter-spacing:.14em;color:#9aa3ad}
</style></head><body><div id="st">
<div class="top"><div class="lg"></div><b><em>SMASH</em> NEWS</b><span style="opacity:.8">FANTASY</span><span class="tag" id="wk"></span></div>
<div class="ttl"><h1 id="h1"></h1><p id="sub"></p></div>
<div class="team" id="t-away" style="top:330px"></div><div class="team" id="t-home"></div>
<div class="tick" id="tick"><small id="tq"></small><b id="tt"></b></div><div class="bar"><i id="ba"></i><i id="bh"></i></div>
<div class="slam" id="slam"><h2 id="sh"></h2><p id="sp"></p></div><div class="fin" id="fin" style="display:none"></div>
</div><script>
const $=(s)=>document.querySelector(s);const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));const seg=(t,a,b)=>clamp((t-a)/(b-a));const oc=p=>1-Math.pow(1-p,3);const ob=p=>1+2.70158*Math.pow(p-1,3)+1.70158*Math.pow(p-1,2);
let D;const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
window.setup=(d)=>{D=d;$('#wk').textContent=d.week?`WEEK ${d.week}`:'FINAL';$('#h1').textContent=`${d.away.name} vs ${d.home.name}`;$('#sub').textContent=`FANTASY SHOWDOWN · ESPN PPR · FINAL ${d.away.score}-${d.home.score}`;
 $('#sh').innerHTML=`FANTASY<br><em>SHOWDOWN</em>`;$('#sp').textContent=`${d.away.abbr} vs ${d.home.abbr} · EVERY PLAYER · REAL ESPN POINTS`;
 for(const k of ['away','home']){const t=d[k];const el=$('#t-'+k);if(k==='home')el.style.top=(330+124+d.away.rows.length*86+40)+'px';
  el.style.setProperty('--c',t.color);el.innerHTML=`<div class="th">${t.logo?`<img src="${t.logo}">`:''}<div><div class="n">${esc(t.name)}</div><div class="s">${esc(t.abbr)} FANTASY</div></div><div class="tot" id="tot-${k}">0.0</div></div>`+
  t.rows.map((r,i)=>`<div class="row" id="r-${k}-${i}"><span class="pos ${r.pos.replace('/','').replace('WRTE','WR')}">${esc(r.pos)}</span><span class="nm"><b>${esc(r.player)}</b><small>${esc(r.line)}</small></span><span class="pt" id="p-${k}-${i}">0.0</span></div>`).join('');}
 $('#ba').style.background=d.away.color;$('#bh').style.background=d.home.color;};
window.frame=(t)=>{const d=D;const T=d.timeline;
 const sl=$('#slam');sl.style.opacity=1-seg(t,1.6,2.0);sl.style.display=t>2.0?'none':'flex';$('#sh').style.transform=`scale(${2.2-1.2*ob(seg(t,0.1,0.6))}) rotate(-4deg)`;$('#sp').style.opacity=seg(t,0.6,1.0);
 // progress through the game: each scoring play is a beat; base yardage points ramp between beats
 const prog=clamp((t-T.start)/(T.end-T.start));const pi=Math.min(d.plays.length-1,Math.floor(prog*d.plays.length));const cur=d.plays[pi];
 const tot={away:0,home:0};
 for(const k of ['away','home'])d[k].rows.forEach((r,i)=>{let v=r.pts*oc(prog);for(const ev of r.events)if(prog>=ev.at)v+=0;const val=Math.min(r.pts,v);tot[k]+=val;$(`#p-${k}-${i}`).textContent=val.toFixed(1);
   const hit=cur&&cur.who.includes(r.player)&&t>T.start&&t<T.end;$(`#r-${k}-${i}`).classList.toggle('hit',hit);});
 for(const k of ['away','home']){tot[k]=d[k].total*oc(prog);const e=$('#tot-'+k);e.textContent=tot[k].toFixed(1);e.classList.toggle('lead',tot[k]>=tot[k==='away'?'home':'away']);}
 const s=tot.away+tot.home||1;$('#ba').style.width=(tot.away/s*100)+'%';$('#bh').style.width=(tot.home/s*100)+'%';
 if(cur){$('#tq').textContent=`${cur.q} · ${cur.team} ${cur.kind} · ${cur.score}`;$('#tt').textContent=cur.fp;}
 $('#tick').style.transform=`translateY(${(1-oc(seg(t,T.start,T.start+0.5)))*300}px)`;
 const f=$('#fin');if(t>=T.end){f.style.display='flex';const p=seg(t,T.end,T.end+0.5);f.style.opacity=p;
  if(!f.dataset.done){f.dataset.done=1;const w=d.away.total>d.home.total?d.away:d.home;const l=w===d.away?d.home:d.away;
   f.innerHTML=`<h3>${esc(w.name.toUpperCase())} WIN THE FANTASY MATCHUP</h3><div class="sc">${w.total.toFixed(1)} <span>– ${l.total.toFixed(1)}</span></div><div class="mvp"><small>FANTASY MVP</small><b>${esc(d.mvp.player)}</b><small>${d.mvp.pts.toFixed(1)} PTS · ${esc(d.mvp.line)}</small></div>`;}
  f.querySelector('.sc').style.transform=`scale(${2-ob(seg(t,T.end+0.1,T.end+0.7))})`;}else f.style.display='none';};
</script></body></html>"""

QN = ['', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', '2OT']


def pos_for(p):
    if p['pos'] and p['pos'] not in ('', None): return p['pos']
    line = p['line']
    if 'PASS' in line: return 'QB'
    import re
    car = re.search(r'(\d+)-(-?\d+) RUSH|(\d+) CAR, (-?\d+) YDS', line); rec = re.search(r'(\d+)-(-?\d+) REC|(\d+) REC, (-?\d+) YDS', line)
    ry = int((car.group(2) or car.group(4))) if car else 0; cy = int((rec.group(2) or rec.group(4))) if rec else 0
    nc = int((car.group(1) or car.group(3))) if car else 0
    return 'RB' if nc >= 3 and ry >= cy else 'WR/TE'


def build(nfl_path, gid, out):
    nfl = json.load(open(nfl_path))
    g = next(x for x in nfl['games'] if str(x['id']) == str(gid))
    f = g['fantasy']
    d = {'week': g.get('week'), 'plays': [], 'timeline': {}}
    for k in ('away', 'home'):
        rows = [dict(r, pos=pos_for(r)) for r in f[k]['players'] if abs(r['pts']) >= 0.5 or r['pos'] == 'D/ST'][:6]
        for r in rows: r['line'] = r['line'].replace('--', '-'); r['events'] = []
        d[k] = {'name': g[k]['name'], 'abbr': g[k]['abbr'], 'score': g[k]['score'], 'color': g[k].get('color') or '#333', 'logo': rv.data_uri(g[k].get('logo')), 'rows': rows, 'total': f[k]['total']}
    for p in g.get('plays') or []:
        fp = ' · '.join(f"+{x['pts']} {x['player'] if x['player'] != 'D/ST' else p['team'] + ' D/ST'}" for x in p.get('fantasy') or []) or p['text']
        kind = 'TD' if 'Field Goal' not in p['text'] else 'FG'
        d['plays'].append({'q': f"{QN[p.get('period') or 0]} {p.get('clock', '')}", 'team': p['team'], 'kind': kind, 'score': f"{p['away']}-{p['home']}", 'fp': fp, 'who': ' '.join(x['player'] for x in p.get('fantasy') or [])})
    if not d['plays']: d['plays'] = [{'q': 'FINAL', 'team': '', 'kind': '', 'score': f"{g['away']['score']}-{g['home']['score']}", 'fp': 'Every player, real ESPN points', 'who': ''}]
    allp = [r for k in ('away', 'home') for r in d[k]['rows'] if r['pos'] != 'D/ST']
    d['mvp'] = max(allp, key=lambda r: r['pts'])
    per = 1.6
    d['timeline'] = {'start': 2.0, 'end': 2.0 + max(8, per * len(d['plays']))}
    total = d['timeline']['end'] + 4.0
    tmp = tempfile.mkdtemp(prefix='fz-')
    hits = [(0.3, 'impact')] + [(2.0 + i * per, 'whoosh') for i in range(len(d['plays']))] + [(d['timeline']['end'], 'impact')]
    music = rv.synth_music(total, hits)
    rv.write_wav(os.path.join(tmp, 'm.wav'), music)
    vid = os.path.join(tmp, 'v.mp4')

    async def render():
        from playwright.async_api import async_playwright
        ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', vid], stdin=subprocess.PIPE)
        async with async_playwright() as p:
            kw = {'args': ['--no-sandbox']}; cp = rv.chrome_path()
            if cp: kw['executable_path'] = cp
            b = await p.chromium.launch(**kw); pg = await b.new_page(viewport={'width': W, 'height': H})
            await pg.set_content(PAGE.replace('/*FONTS*/', rv.font_css()))
            await pg.evaluate('(d) => window.setup(d)', d)
            for i in range(int(total * FPS)):
                await pg.evaluate('(t) => window.frame(t)', i / FPS)
                ff.stdin.write(await pg.screenshot(type='jpeg', quality=90))
            await b.close()
        ff.stdin.close(); ff.wait()
    asyncio.run(render())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', vid, '-i', os.path.join(tmp, 'm.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], check=True)
    print(f'fantasy video: {out} ({os.path.getsize(out) / 1e6:.1f} MB, {total:.0f}s)')


if __name__ == '__main__':
    build(*sys.argv[1:4])

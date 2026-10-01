"""SMASH ROAD WATCH video: a US map that flies into each state with road incidents (crashes, closures,
construction, police) and shows each one with place, time, and any reopening estimate the source gave.
Usage: python3 scripts/road_video.py <roadwatch.json> <out.mp4>"""
import asyncio, json, os, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recap_video as rv

W, H, FPS = 1080, 1920, 30
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><style>/*FONTS*/
*{box-sizing:border-box;margin:0;padding:0}html,body{width:1080px;height:1920px;overflow:hidden;background:#06080b;color:#fff;font-family:Oswald,Arial,sans-serif}
#st{position:absolute;inset:0;background:radial-gradient(100% 60% at 50% 25%,#0f1a22,#06080b 70%)}
.top{position:absolute;top:50px;left:54px;right:54px;display:flex;align-items:center;gap:14px;font-weight:700;letter-spacing:.14em;font-size:28px;z-index:5}
.top .lg{width:46px;height:46px;border-radius:50%;border:5px solid #c6ff3d}.top b{font-family:Anton;font-weight:400;font-size:40px;letter-spacing:.05em}.top b em{font-style:normal;color:#c6ff3d}
.top .tag{margin-left:auto;background:#ff3d2e;color:#fff;padding:6px 16px;border-radius:6px;font-size:24px}
.ttl{position:absolute;top:126px;left:54px;right:54px;z-index:5}.ttl h1{font-family:Anton;font-weight:400;font-size:92px;line-height:1}.ttl h1 em{font-style:normal;color:#c6ff3d}.ttl p{font-size:28px;letter-spacing:.16em;color:#9aa3ad;margin-top:6px}
#mapw{position:absolute;left:0;right:0;top:300px;height:900px}
svg{width:100%;height:100%}
.s{fill:#18222c;stroke:#3a4a58;stroke-width:.6;vector-effect:non-scaling-stroke}.s.hot{fill:#3a1714;stroke:#ff6b5a}.s.on{fill:#2b3b14;stroke:#c6ff3d;stroke-width:2.5}
.c{fill:none;stroke:#4d6070;stroke-width:.5;vector-effect:non-scaling-stroke}.c.on{fill:rgba(198,255,61,.18);stroke:#c6ff3d}
.lbl{position:absolute;font-family:Anton;font-size:30px;text-shadow:0 2px 10px #000;transform:translate(-50%,-50%);white-space:nowrap}
.cards{position:absolute;left:40px;right:40px;top:1210px;display:flex;flex-direction:column;gap:16px}
.sname{display:flex;align-items:baseline;gap:16px}.sname b{font-family:Anton;font-weight:400;font-size:72px}.sname span{font-size:30px;letter-spacing:.14em;color:#ff6b5a;font-weight:700}
.card{display:flex;gap:18px;align-items:flex-start;padding:18px 22px;border-radius:20px;background:#11161c;border:2px solid rgba(255,255,255,.08);border-left:10px solid var(--k)}
.card .ic{font-size:50px;line-height:1}.card .tx{flex:1;min-width:0}.card .k{font-size:22px;font-weight:700;letter-spacing:.16em;color:var(--k)}
.card .t{font-size:33px;font-weight:700;line-height:1.15;max-height:78px;overflow:hidden}.card .m{font-size:23px;color:#9aa3ad;margin-top:4px}.card .m b{color:#c6ff3d}
.fin{position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(80% 60% at 50% 40%,rgba(255,61,46,.25),#06080b 70%)}
.fin h2{font-family:Anton;font-weight:400;font-size:190px;line-height:1}.fin p{font-size:40px;letter-spacing:.16em;margin-top:10px}.fin small{display:block;margin-top:40px;font-size:30px;color:#c6ff3d;letter-spacing:.2em}
</style></head><body><div id="st">
<div class="top"><div class="lg"></div><b><em>SMASH</em> NEWS</b><span style="opacity:.8">ROAD WATCH</span><span class="tag" id="clock"></span></div>
<div class="ttl"><h1 id="h1"></h1><p id="sub"></p></div>
<div id="mapw"><svg id="map" preserveAspectRatio="xMidYMid meet"><g id="gs"></g><g id="gc"></g><g id="gp"></g></svg><div id="lbls"></div></div>
<div class="cards" id="cards"></div><div class="fin" id="fin" style="display:none"></div>
</div><script>
const $=(s)=>document.querySelector(s);const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));const seg=(t,a,b)=>clamp((t-a)/(b-a));const ioc=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;const oc=p=>1-Math.pow(1-p,3);const ob=p=>1+2.70158*Math.pow(p-1,3)+1.70158*Math.pow(p-1,2);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KC={crash:'#ff3d2e',closure:'#ff9f1c',construction:'#ffd400',police:'#3d8bff',fire:'#ff6b2e',weather:'#22c3ee',traffic:'#c6ff3d'};
let M,D,SC,cur=-1;const US=[-10,-10,995,630];
function vb(b){$('#map').setAttribute('viewBox',b.map(x=>x.toFixed(2)).join(' '));}
function boxFor(bb){const pad=Math.max(bb[2]-bb[0],bb[3]-bb[1])*0.18+12;let x0=bb[0]-pad,y0=bb[1]-pad,w=bb[2]-bb[0]+2*pad,h=bb[3]-bb[1]+2*pad;const ar=1080/900;if(w/h<ar){const nw=h*ar;x0-=(nw-w)/2;w=nw}else{const nh=w/ar;y0-=(nh-h)/2;h=nh}return[x0,y0,w,h];}
const lerpB=(a,b,p)=>a.map((x,i)=>x+(b[i]-x)*p);
window.setup=(d)=>{D=d.rw;M=d.map;SC=d.scenes;
 $('#clock').textContent=d.clock;$('#h1').innerHTML='ROAD <em>WATCH</em>';$('#sub').textContent=`${D.total} INCIDENTS · ${D.stateCount} STATES · UPDATED ${d.clock}`;
 const hot=new Set(D.states.map(s=>s.name));
 $('#gs').innerHTML=M.states.map(s=>`<path class="s ${hot.has(s.name)?'hot':''}" id="s-${s.id}" d="${s.d}"/>`).join('');
 $('#gc').innerHTML=M.ilCounties.map(c=>`<path class="c" id="c-${c.id}" d="${c.d}" style="opacity:0"/>`).join('');
 // pins: county centroid when known, else spread around the state's center
 let pins='';D.states.forEach((s,si)=>{const st=M.states.find(x=>x.name===s.name);if(!st)return;s.incidents.forEach((it,k)=>{let p=st.c;const co=it.county&&s.name==='Illinois'?M.ilCounties.find(c=>c.name===it.county):null;
   if(co)p=co.c;const a=k*2.4+si,r=co?2.5*k:(Math.min(st.bbox[2]-st.bbox[0],st.bbox[3]-st.bbox[1])*0.12)*(k?1:0);const x=p[0]+Math.cos(a)*r,y=p[1]+Math.sin(a)*r;
   pins+=`<g class="pin" data-s="${si}" data-k="${k}" transform="translate(${x} ${y})"><circle class="ring" r="0" fill="none" stroke="${KC[it.type]}" stroke-width="1.5" vector-effect="non-scaling-stroke"/><circle class="dot" r="0" fill="${KC[it.type]}"/></g>`;});});
 $('#gp').innerHTML=pins;vb(US);};
window.frame=(t)=>{let i=SC.findIndex(s=>t<s.start+s.dur);if(i<0)i=SC.length-1;const sc=SC[i],lt=t-sc.start;
 const fin=$('#fin');
 if(sc.kind==='intro'){vb(US);document.querySelectorAll('.s.hot').forEach(e=>e.style.fillOpacity=.6+.4*Math.sin(t*6));$('#cards').innerHTML='';$('#lbls').innerHTML='';fin.style.display='none';
   $('#map').style.opacity=seg(lt,0,.6);$('#h1').style.transform=`scale(${2-ob(seg(lt,.1,.6))})`;
   document.querySelectorAll('.pin').forEach((p,k)=>{const q=seg(lt,.6+k*.04,.9+k*.04);p.querySelector('.dot').setAttribute('r',(3*ob(q)).toFixed(2));});return;}
 if(sc.kind==='outro'){fin.style.display='flex';fin.style.opacity=seg(lt,0,.4);if(!fin.dataset.d){fin.dataset.d=1;fin.innerHTML=`<h2>${D.total}</h2><p>ROAD INCIDENTS · ${D.stateCount} STATES</p><small>SMASH ROAD WATCH · NEW EVERY 10 MINUTES</small>`;}
   fin.querySelector('h2').style.transform=`scale(${2-ob(seg(lt,.1,.6))})`;vb(lerpB(SC[i-1]?.box||US,US,ioc(seg(lt,0,.8))));return;}
 fin.style.display='none';
 const s=D.states[sc.si];const prev=SC[i-1]?.box||US;vb(lerpB(prev,sc.box,ioc(seg(lt,0,.9))));
 if(i!==cur){cur=i;document.querySelectorAll('.s').forEach(e=>{e.classList.remove('on');e.style.fillOpacity=''});const el=document.getElementById('s-'+sc.sid);el&&el.classList.add('on');
   const il=s.name==='Illinois';const cs=new Set(s.incidents.map(x=>x.county).filter(Boolean));document.querySelectorAll('.c').forEach(c=>{c.style.opacity=il?1:0;c.classList.toggle('on',il&&cs.has(M.ilCounties.find(x=>'c-'+x.id===c.id)?.name))});
   const ago=(a)=>{const m=Math.max(1,Math.round((Date.parse(SC.now)-Date.parse(a))/6e4));return m<60?`${m}m ago`:`${Math.round(m/60)}h ago`};
   $('#cards').innerHTML=`<div class="sname"><b>${esc(s.name.toUpperCase())}</b><span>${s.count} INCIDENT${s.count>1?'S':''}</span></div>`+s.incidents.map(it=>`<div class="card" style="--k:${KC[it.type]}"><div class="ic">${it.icon}</div><div class="tx"><div class="k">${it.label}${it.place?` · ${esc(it.place.toUpperCase())}`:''}</div><div class="t">${esc(it.title)}</div><div class="m">${ago(it.at)} · ${esc(it.source||'')}${it.est?` · <b>Est: ${esc(it.est)}</b>`:''}</div></div></div>`).join('');}
 const z=sc.box[2]/975;
 document.querySelectorAll('.pin').forEach(p=>{const on=+p.dataset.s===sc.si;const k=+p.dataset.k;const q=on?seg(lt,.8+k*.18,1.1+k*.18):0;
   p.querySelector('.dot').setAttribute('r',((on?11:3)*z*ob(q||0.0001)+(on?0:2.5*z)).toFixed(2));const rr=((lt*1.4+k*.3)%1);p.querySelector('.ring').setAttribute('r',(on?(8+rr*26)*z:0).toFixed(2));p.querySelector('.ring').setAttribute('opacity',(1-rr).toFixed(2));});
 const sn=$('#cards .sname');if(sn)sn.style.transform=`translateX(${(1-oc(seg(lt,.5,.9)))*-900}px)`;
 document.querySelectorAll('#cards .card').forEach((c,k)=>{const q=oc(seg(lt,.9+k*.18,1.3+k*.18));c.style.opacity=q;c.style.transform=`translateY(${(1-q)*80}px)`;});
};
</script></body></html>"""


def build(rw_path, out, clock=None):
    rw = json.load(open(rw_path))
    mp = json.load(open(os.path.join(ROOT, 'assets', 'us-map.json')))
    from datetime import datetime
    from zoneinfo import ZoneInfo
    now = datetime.fromisoformat(rw['createdAt'].replace('Z', '+00:00')).astimezone(ZoneInfo('America/Chicago'))
    clock = clock or now.strftime('%-I:%M %p')
    US = [-10, -10, 995, 630]
    def box(bb):
        pad = max(bb[2] - bb[0], bb[3] - bb[1]) * 0.18 + 12
        x0, y0, w, h = bb[0] - pad, bb[1] - pad, bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad
        ar = 1080 / 900
        if w / h < ar: nw = h * ar; x0 -= (nw - w) / 2; w = nw
        else: nh = w / ar; y0 -= (nh - h) / 2; h = nh
        return [x0, y0, w, h]
    scenes, t = [{'kind': 'intro', 'start': 0, 'dur': 2.6, 'box': US}], 2.6
    for si, s in enumerate(rw['states']):
        st = next((x for x in mp['states'] if x['name'] == s['name']), None)
        if not st: continue
        bb = st['bbox']
        if s['name'] == 'Illinois':  # zoom to the counties that have incidents (Chicagoland), not the whole state
            cs = [c for c in mp['ilCounties'] if c['name'] in {i.get('county') for i in s['incidents']}]
            if cs: bb = [min(c['bbox'][0] for c in cs), min(c['bbox'][1] for c in cs), max(c['bbox'][2] for c in cs), max(c['bbox'][3] for c in cs)]
        dur = 2.4 + 0.9 * len(s['incidents'])
        scenes.append({'kind': 'state', 'si': si, 'sid': st['id'], 'start': t, 'dur': dur, 'box': box(bb)})
        t += dur
    scenes.append({'kind': 'outro', 'start': t, 'dur': 3.2, 'box': US})
    total = t + 3.2
    tmp = tempfile.mkdtemp(prefix='rw-')
    music = rv.synth_music(total, [(0.4, 'impact')] + [(s['start'], 'whoosh') for s in scenes[1:]])
    rv.write_wav(os.path.join(tmp, 'm.wav'), music)
    vid = os.path.join(tmp, 'v.mp4')

    async def render():
        from playwright.async_api import async_playwright
        ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', vid], stdin=subprocess.PIPE)
        async with async_playwright() as p:
            kw = {'args': ['--no-sandbox']}; cp = rv.chrome_path()
            if cp: kw['executable_path'] = cp
            b = await p.chromium.launch(**kw); pg = await b.new_page(viewport={'width': W, 'height': H})
            await pg.set_content(PAGE.replace('/*FONTS*/', rv.font_css()))
            sc = scenes; sc_js = json.loads(json.dumps(sc))
            await pg.evaluate('(d) => { d.scenes.now = d.now; window.setup(d); }', {'rw': rw, 'map': mp, 'scenes': sc_js, 'clock': clock, 'now': rw['createdAt']})
            for i in range(int(total * FPS)):
                await pg.evaluate('(t) => window.frame(t)', i / FPS)
                ff.stdin.write(await pg.screenshot(type='jpeg', quality=88))
            await b.close()
        ff.stdin.close(); ff.wait()
    asyncio.run(render())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', vid, '-i', os.path.join(tmp, 'm.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out + '.part.mp4'], check=True)
    os.replace(out + '.part.mp4', out)
    print(f'road watch video: {out} ({os.path.getsize(out) / 1e6:.1f} MB, {total:.0f}s, {len(scenes) - 2} states)')


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])

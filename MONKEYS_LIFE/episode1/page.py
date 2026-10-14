"""The production page for Episode 1 (one HTML file + the reference pictures of Seven in ref/).

    python build.py <dir> && python page.py <dir>     -> <dir>/index.html + <dir>/ref/*.jpg, then publish index.html
                                                         with the ref/ pictures as its files (artifact "ARISE Shot List")
"""
import html, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from ep import CHAR, LOOK                                                                  # noqa: E402

E = html.escape
REFS = [('seven_face.jpg', 'Face'), ('seven_mud.jpg', 'Muddy — cold open'), ('seven_body.jpg', 'Body, device glowing'),
        ('seven_device.jpg', 'The device')]
PORTRAIT = ("Wildlife portrait photograph of {d}. Chest-up, facing the camera, in a dim green jungle, soft natural light, "
            "85mm lens, sharp focus on the eyes, photorealistic. No text.")


def troop():
    out = []
    for c, name, role in [('G', 'Grub', 'Huge, loud, permanently suspicious.'),
                          ('P', 'Petch', 'Small, wiry, anxious. The heart.'),
                          ('D', 'Dolo', 'Calm, watches everything. The smart one.')]:
        p = PORTRAIT.format(d=CHAR[c].split(' — ', 1)[1])
        out.append(f'<div class="mate"><h4>{name}</h4><p>{E(role)}</p><p class="prompt" id="pp-{c}">{E(p)}</p>'
                   f'<button class="copy" data-copy="pp-{c}" type="button">Copy portrait prompt</button></div>')
    return '\n'.join(out)


def line_html(who, text):
    if who == 'SEVEN': return f'<li class="word"><span>Seven, in English</span>{E(text)}</li>'
    if who == 'CAP': return f'<li class="cap"><span>On screen</span>{E(text)}</li>'
    return f'<li class="sub"><span>{E(who.title())}</span>{E(text)}</li>'


def shot_html(s):
    if s['kind'] == 'mine':
        return (f'<div class="shot mine"><div class="num"><span class="tc">{s["at"]}</span></div><div class="body">'
                f'<p class="what">{E(s["what"])}</p><p class="mine-note">I make this one in the edit.</p></div></div>')
    n = s['n']; lines = ''.join(line_html(w, t) for w, t in s['lines'])
    his = f'<p class="his"><span>Your words</span>{E(s["his"])}</p>' if s['his'] else ''
    who = ' · '.join(s['who']) if s['who'] else 'No one on screen'
    flash = ' flash' if s['kind'] == 'flash' else ''
    return (f'<article class="shot{flash}" id="c{n:03d}" data-n="{n}"><div class="num"><b>{n:03d}</b><small>{s["make"]} s</small>'
            f'<span class="tc">{s["at"]}</span></div><div class="body"><p class="what">{E(s["what"])}</p>{his}'
            + (f'<ul class="lines">{lines}</ul>' if lines else '') +
            f'<p class="who">{E(who)}</p><details><summary>Prompt</summary><p class="prompt" id="p{n:03d}">{E(s["prompt"])}</p></details>'
            f'<div class="acts"><button class="copy" data-copy="p{n:03d}" type="button">Copy prompt</button>'
            f'<button class="made" data-n="{n}" type="button" aria-pressed="false">Made</button></div></div></article>')


def scene_html(sc, i):
    clips = [s for s in sc['shots'] if s['kind'] != 'mine']
    new = '<span class="chip new">New — not in your script</span>' if sc['new'] else ''
    first = clips[0]['n'] if clips else 0; last = clips[-1]['n'] if clips else 0
    return (f'<section class="scene" id="s{i}" data-first="{first}" data-last="{last}"><header class="scene-head">'
            f'<span class="tc">{sc["start"]}</span><h3>{E(sc["title"])}</h3>'
            f'<span class="smeta">{sc["when"]} · {sc["length"]} · <span class="sdone" data-scene="{i}">0</span>/{len(clips)} made</span>'
            f'{new}</header><p class="note">{E(sc["note"])}</p>' + ''.join(shot_html(s) for s in sc['shots']) + '</section>')


def main():
    dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out')
    d = json.load(open(os.path.join(dst, 'ep1.json')))
    prompts_txt = open(os.path.join(dst, 'ep1_prompts.txt')).read()
    magic_txt = open(os.path.join(dst, 'ep1_magiclight.txt')).read()
    n_new = sum(1 for sc in d['scenes'] if sc['new'])
    index = ''.join(f'<a href="#s{i}"><span class="tc">{sc["start"]}</span>{E(sc["title"])}{" <em>new</em>" if sc["new"] else ""}</a>'
                    for i, sc in enumerate(d['scenes']))
    refs = ''.join(f'<figure><img src="ref/{f}" alt="Seven — {E(c)}" loading="lazy"><figcaption>{E(c)}</figcaption></figure>'
                   for f, c in REFS)
    page = TEMPLATE.replace('%CLIPS%', str(d['clips'])).replace('%TOTAL%', d['total']).replace('%NEW%', str(n_new))
    page = page.replace('%INDEX%', index).replace('%REFS%', refs).replace('%TROOP%', troop())
    page = page.replace('%SCENES%', '\n'.join(scene_html(sc, i) for i, sc in enumerate(d['scenes'])))
    page = page.replace('%PROMPTS%', E(prompts_txt)).replace('%MAGIC%', E(magic_txt))
    open(os.path.join(dst, 'index.html'), 'w').write(page)
    import shutil; os.makedirs(os.path.join(dst, 'ref'), exist_ok=True)
    for f, _ in REFS: shutil.copy(os.path.join(HERE, 'ref', f), os.path.join(dst, 'ref', f))
    print('page', len(page) // 1024, 'KB')


TEMPLATE = r'''<title>ARISE Shot List</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap">
<style>
/* One phone-width column like a film slate list: scene bars stick while you scroll, every clip is a row with its
   number, what we see, the lines, and two buttons. Swamp-dark by default; the device's cold blue is the one accent. */
:root{
  --bg:#0b1210; --panel:#111a17; --raise:#16211d; --fg:#e3eae5; --dim:#8b9c93; --line:#22302a;
  --glow:#63b9ff; --glow-ink:#06121b; --new:#e2a64a; --ok:#6fcf97;
  --display:"Bebas Neue","Oswald",Impact,"Arial Narrow",sans-serif;
  --body:"Source Sans 3","Segoe UI",system-ui,-apple-system,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  color-scheme:dark;
}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){
  --bg:#eef3f0; --panel:#ffffff; --raise:#f5f8f6; --fg:#12201a; --dim:#55675d; --line:#d3ddd7;
  --glow:#1b6cb8; --glow-ink:#ffffff; --new:#94590a; --ok:#1d8548; color-scheme:light}}
:root[data-theme="light"]{
  --bg:#eef3f0; --panel:#ffffff; --raise:#f5f8f6; --fg:#12201a; --dim:#55675d; --line:#d3ddd7;
  --glow:#1b6cb8; --glow-ink:#ffffff; --new:#94590a; --ok:#1d8548; color-scheme:light}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font:16px/1.5 var(--body);margin:0}
.wrap{max-width:46rem;margin:0 auto;padding-inline:16px;padding-block:20px 64px;display:flex;flex-direction:column;gap:28px}
h1,h2,h3,h4{font-family:var(--display);font-weight:400;letter-spacing:.02em;margin:0;line-height:1;text-wrap:balance}
.tc{font:500 12px/1 var(--mono);color:var(--dim);font-variant-numeric:tabular-nums}
button{font:600 15px/1 var(--body);border-radius:10px;padding:12px 14px;border:1px solid var(--line);background:var(--raise);color:var(--fg);cursor:pointer;min-height:44px}
button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--glow);outline-offset:2px}
button.copy{background:var(--glow);border-color:var(--glow);color:var(--glow-ink)}
.top{display:flex;flex-direction:column;gap:10px}
.show{font:400 15px/1 var(--display);letter-spacing:.32em;color:var(--glow)}
.top h1{font-size:clamp(44px,12vw,72px)}
.meta{margin:0;color:var(--dim)} .meta b{color:var(--fg);font-variant-numeric:tabular-nums}
.progress{display:flex;align-items:center;gap:12px}
.bar{flex:1;height:8px;border-radius:99px;background:var(--line);overflow:hidden}
.bar i{display:block;height:100%;width:0;background:var(--ok);transition:width .3s}
#made{font:500 13px/1 var(--mono);color:var(--dim);white-space:nowrap}
.steps{margin:0;padding:0;list-style:none;display:grid;gap:14px;counter-reset:st}
.steps li{display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:start}
.steps li::before{counter-increment:st;content:counter(st);font:400 28px/1 var(--display);color:var(--glow);padding-top:2px}
.steps b{display:block;font-size:17px}
.steps p{margin:2px 0 0;color:var(--dim)}
h2{font-size:30px}
.block{display:flex;flex-direction:column;gap:14px}
.refs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
@media (max-width:560px){.refs{grid-template-columns:repeat(2,1fr)}}
.refs figure{margin:0;display:flex;flex-direction:column;gap:6px}
.refs img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:8px;background:var(--panel)}
.refs figure:last-child img{object-fit:cover}
.refs figcaption{font-size:13px;color:var(--dim)}
.hint{margin:0;color:var(--dim);font-size:15px}
.troop{display:grid;gap:12px}
.mate{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;min-width:0}
.mate h4{font-size:24px} .mate p{margin:0} .mate>p:first-of-type{color:var(--dim)}
.prompt{font:400 13px/1.5 var(--mono);color:var(--fg);margin:0;overflow-wrap:anywhere}
.mate .prompt{color:var(--dim)}
.settings{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.settings li{font:500 13px/1 var(--mono);border:1px solid var(--line);border-radius:99px;padding:8px 10px}
.index{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.index a{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:10px;background:var(--panel);border:1px solid var(--line);color:var(--fg);text-decoration:none;font-weight:600;min-width:0}
.index em{font-style:normal;font:600 11px/1 var(--mono);color:var(--new);text-transform:uppercase;letter-spacing:.08em}
.scene{display:flex;flex-direction:column;gap:10px;scroll-margin-top:8px}
.scene-head{position:sticky;top:env(safe-area-inset-top,0px);z-index:2;background:var(--bg);padding-block:12px 10px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.scene-head h3{font-size:30px;flex:1 1 auto}
.smeta{font:500 12px/1 var(--mono);color:var(--dim);font-variant-numeric:tabular-nums;width:100%}
.chip{font:600 11px/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;border-radius:99px;padding:6px 8px}
.chip.new{color:var(--new);border:1px solid var(--new)}
.note{margin:0;color:var(--dim)}
.shot{display:grid;grid-template-columns:58px 1fr;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.shot .num{display:flex;flex-direction:column;gap:4px}
.shot .num b{font:600 20px/1 var(--mono);font-variant-numeric:tabular-nums}
.shot .num small{font:500 12px/1 var(--mono);color:var(--glow)}
.shot .body{display:flex;flex-direction:column;gap:8px;min-width:0}
.what{margin:0;font-weight:600;font-size:17px}
.his{margin:0;font-style:italic;color:var(--fg)}
.his span,.lines span{display:block;font:600 11px/1.4 var(--mono);font-style:normal;text-transform:uppercase;letter-spacing:.08em;color:var(--dim)}
.lines{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.lines .sub{font-style:italic}
.lines .word{font-weight:700;font-size:19px;color:var(--glow)}
.lines .cap{font:400 15px/1.4 var(--body);letter-spacing:.02em}
.who{margin:0;font:500 12px/1 var(--mono);color:var(--dim)}
details summary{cursor:pointer;color:var(--dim);font-size:14px;min-height:28px}
details .prompt{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:6px}
.acts{display:flex;gap:8px;flex-wrap:wrap}
.acts button{flex:1 1 130px}
button.made[aria-pressed="true"]{background:transparent;border-color:var(--ok);color:var(--ok)}
.shot.done .num b{color:var(--ok)}
.shot.done .what{color:var(--dim)}
.shot.flash .what::before{content:"Memory flash · ";color:var(--glow)}
.shot.mine{opacity:.75}
.mine-note{margin:0;color:var(--dim);font-size:14px}
.toast{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--fg);color:var(--bg);font-weight:600;padding:10px 14px;border-radius:10px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:5}
.toast.on{opacity:1}
.other{display:grid;gap:10px}
.other p{margin:0;color:var(--dim)}
.hidden-text{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
footer{color:var(--dim);font-size:14px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<div class="wrap">
<header class="top">
  <div class="show">MONKEY'S LIFE</div>
  <h1>Episode 1 · ARISE</h1>
  <p class="meta"><b>%CLIPS%</b> clips · <b>%TOTAL%</b> long · <b>%NEW%</b> new scenes added</p>
  <div class="progress"><div class="bar"><i id="barfill"></i></div><span id="made">0 of %CLIPS% made</span></div>
</header>

<section class="block">
  <h2>How to make it</h2>
  <ol class="steps">
    <li><div><b>Lock everyone's look</b><p>Save Seven's 4 pictures below and add them in the video app as his character reference (in Kling it's called Elements). Make Grub, Petch and Dolo once with their portrait prompts and keep the best of each as their reference.</p></div></li>
    <li><div><b>Make the clips, in order</b><p>For each clip: Copy prompt, paste it into the app, add the references for whoever is in it, set the length shown (5 or 10 s), generate. Save it with its number, like 001. Tap Made.</p></div></li>
    <li><div><b>Send them to me, a scene at a time</b><p>I cut them together and add the subtitles, Seven's words, the sound, the title cards and the credits.</p></div></li>
  </ol>
  <ul class="settings"><li>16:9</li><li>1080p</li><li>5 or 10 s as marked</li><li>sound on if the app has it</li><li>no text in the picture</li></ul>
</section>

<section class="block">
  <h2>Seven</h2>
  <div class="refs">%REFS%</div>
  <p class="hint">His two English words are spoken, not grunted. Record them on your phone (quiet, rough, confused) and send them with the clips, or tell me to find a voice.</p>
</section>

<section class="block">
  <h2>The troop</h2>
  <div class="troop">%TROOP%</div>
</section>

<section class="block">
  <h2>Scenes</h2>
  <nav class="index" aria-label="Scenes">%INDEX%</nav>
</section>

%SCENES%

<section class="block other">
  <h2>Other ways</h2>
  <p>Whole episode as one script for MagicLight: one go, much less work, but it looks animated rather than real.</p>
  <button class="copy" data-copy="magic" type="button">Copy the MagicLight script</button>
  <p>All %CLIPS% prompts as one block of text.</p>
  <button data-copy="allprompts" type="button">Copy all prompts</button>
</section>
<footer>Built from your Episode 1 script, comic and series bible. Scenes marked new are extra: cut any you don't want.</footer>
</div>
<div class="hidden-text" aria-hidden="true"><pre id="magic">%MAGIC%</pre><pre id="allprompts">%PROMPTS%</pre></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
(function(){
  var KEY='monkeys-life-ep1-made', made={};
  try{ made=JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ made={}; }
  var total=%CLIPS%, toastEl=document.getElementById('toast'), tt;
  function toast(msg){ toastEl.textContent=msg; toastEl.classList.add('on'); clearTimeout(tt); tt=setTimeout(function(){toastEl.classList.remove('on');},1600); }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(made)); }catch(e){} }
  function paint(){
    var count=0;
    document.querySelectorAll('button.made').forEach(function(b){
      var on=!!made[b.dataset.n]; if(on) count++;
      b.setAttribute('aria-pressed', on?'true':'false'); b.textContent=on?'Made ✓':'Made';
      b.closest('.shot').classList.toggle('done', on);
    });
    document.querySelectorAll('.scene').forEach(function(sc){
      var a=+sc.dataset.first, z=+sc.dataset.last, c=0;
      for(var i=a;i<=z && a;i++) if(made[i]) c++;
      var el=sc.querySelector('.sdone'); if(el) el.textContent=c;
    });
    document.getElementById('made').textContent=count+' of '+total+' made';
    document.getElementById('barfill').style.width=(100*count/total)+'%';
  }
  function selectText(el){
    var d=el.closest('details'); if(d) d.open=true;
    var r=document.createRange(); r.selectNodeContents(el); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  document.addEventListener('click', function(ev){
    var b=ev.target.closest('button'); if(!b) return;
    if(b.dataset.copy){
      var el=document.getElementById(b.dataset.copy), text=el.textContent;
      var done=function(){ toast(b.dataset.copy.length>4?'Copied':'Copied — paste it in the app'); };
      var fail=function(){ if(el.closest('.hidden-text')){ toast('Copy is blocked here — open each clip instead'); } else { selectText(el); toast('Selected — tap Copy'); } };
      try{ navigator.clipboard.writeText(text).then(done, fail); }catch(e){ fail(); }
    } else if(b.classList.contains('made')){
      var n=b.dataset.n; if(made[n]) delete made[n]; else made[n]=1; save(); paint();
    }
  });
  paint();
})();
</script>
'''

if __name__ == '__main__': main()

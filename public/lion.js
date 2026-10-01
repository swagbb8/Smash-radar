// SMASH the lion — animated news anchor that reads the latest SMASH NEWS briefing out loud (Web Speech API).
const NS = 'http://www.w3.org/2000/svg';

export function lionSVG() {
  // mane spikes
  const spikes = (r1, r2, n, rot) => {
    let d = '';
    for (let i = 0; i < n; i++) {
      const a0 = ((i / n) * Math.PI * 2) + rot;
      const a1 = (((i + 0.5) / n) * Math.PI * 2) + rot;
      const a2 = (((i + 1) / n) * Math.PI * 2) + rot;
      const p = (a, r) => `${(200 + Math.cos(a) * r).toFixed(1)},${(190 + Math.sin(a) * r).toFixed(1)}`;
      d += `${i ? 'L' : 'M'}${p(a0, r1)} Q${p((a0 + a1) / 2, r2 * 0.96)} ${p(a1, r2)} Q${p((a1 + a2) / 2, r2 * 0.96)} ${p(a2, r1)} `;
    }
    return `${d}Z`;
  };
  return `<svg class="lion" viewBox="0 0 400 470" xmlns="${NS}" aria-label="Smash the lion">
  <defs>
    <radialGradient id="lnFace" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#ffd978"/><stop offset="1" stop-color="#eaa93b"/></radialGradient>
    <radialGradient id="lnMane" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#d9651c"/><stop offset="1" stop-color="#8f3a0c"/></radialGradient>
    <linearGradient id="lnSuit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2533"/><stop offset="1" stop-color="#0b0f16"/></linearGradient>
  </defs>
  <g class="ln-body">
    <path d="M60 470 C70 380 130 350 200 350 C270 350 330 380 340 470 Z" fill="url(#lnSuit)"/>
    <path d="M168 352 L200 420 L232 352 Z" fill="#f2f5f3"/>
    <path d="M192 366 L208 366 L214 440 L200 458 L186 440 Z" fill="#c6ff3d"/>
    <path d="M150 356 L200 420 L175 470 L120 470 Z M250 356 L200 420 L225 470 L280 470 Z" fill="#141b26"/>
    <circle cx="268" cy="410" r="9" fill="#c6ff3d"/><text x="268" y="414" font-size="9" text-anchor="middle" font-family="sans-serif" font-weight="800" fill="#0b1100">S</text>
  </g>
  <g class="ln-head">
    <path d="${spikes(118, 176, 22, 0)}" fill="url(#lnMane)"/>
    <path d="${spikes(110, 150, 18, 0.18)}" fill="#e07a24"/>
    <circle cx="112" cy="98" r="30" fill="#eaa93b"/><circle cx="112" cy="98" r="16" fill="#f7a6a0"/>
    <circle cx="288" cy="98" r="30" fill="#eaa93b"/><circle cx="288" cy="98" r="16" fill="#f7a6a0"/>
    <ellipse cx="200" cy="200" rx="108" ry="112" fill="url(#lnFace)"/>
    <path d="M140 150 Q160 138 180 150" stroke="#8f3a0c" stroke-width="7" fill="none" stroke-linecap="round" class="ln-brow"/>
    <path d="M220 150 Q240 138 260 150" stroke="#8f3a0c" stroke-width="7" fill="none" stroke-linecap="round" class="ln-brow"/>
    <g class="ln-eyes">
      <ellipse cx="160" cy="180" rx="19" ry="22" fill="#fff"/><ellipse cx="240" cy="180" rx="19" ry="22" fill="#fff"/>
      <circle cx="163" cy="184" r="11" fill="#2a1a0c"/><circle cx="243" cy="184" r="11" fill="#2a1a0c"/>
      <circle cx="167" cy="179" r="4" fill="#fff"/><circle cx="247" cy="179" r="4" fill="#fff"/>
      <rect class="ln-lid" x="138" y="156" width="44" height="0" fill="#eaa93b"/><rect class="ln-lid" x="218" y="156" width="44" height="0" fill="#eaa93b"/>
    </g>
    <ellipse cx="200" cy="262" rx="74" ry="52" fill="#ffe7ad"/>
    <path d="M178 228 Q200 220 222 228 Q214 250 200 254 Q186 250 178 228 Z" fill="#5a2a12"/>
    <path d="M200 254 L200 268" stroke="#5a2a12" stroke-width="4"/>
    <g class="ln-mouth" transform="translate(200 270)">
      <ellipse class="ln-jaw" cx="0" cy="10" rx="34" ry="4" fill="#5b1015"/>
      <ellipse class="ln-tongue" cx="0" cy="14" rx="18" ry="0" fill="#ff7b86"/>
    </g>
    <path d="M166 268 Q182 280 200 268 Q218 280 234 268" stroke="#5a2a12" stroke-width="4" fill="none" stroke-linecap="round" class="ln-smile"/>
    <g fill="#c98a3a"><circle cx="160" cy="262" r="3"/><circle cx="148" cy="272" r="3"/><circle cx="162" cy="280" r="3"/><circle cx="240" cy="262" r="3"/><circle cx="252" cy="272" r="3"/><circle cx="238" cy="280" r="3"/></g>
  </g>
</svg>`;
}

/** SMASH Live show: plays the briefing (neural-voice MP3s when available, phone voice otherwise) and animates the lion. */
export class LionShow {
  constructor(root, { onSegment, onState, onEnd, onAdvance } = {}) {
    this.root = root;
    this.onAdvance = onAdvance || (() => false);
    this.offset = 0;
    this.onSegment = onSegment || (() => {});
    this.onState = onState || (() => {});
    this.onEnd = onEnd || (() => {});
    this.segments = [];
    this.i = 0;
    this.playing = false;
    this.level = 0;
    this.rate = 1;
    this.voice = null;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.playsInline = true;
    this.audio.addEventListener('ended', () => this._advance());
    this.audio.addEventListener('error', () => { if (this.playing) this._speakFallback(); });
    this._blinkT = performance.now() + 2500;
    this.tick = this.tick.bind(this);
    this._raf = requestAnimationFrame(this.tick);
  }
  get mode() { return this.segments.some((s) => s.audio) ? 'neural' : 'device'; }
  static voices() {
    const all = (window.speechSynthesis?.getVoices() || []).filter((v) => /^en(-|_)/i.test(v.lang));
    const score = (v) => (/en[-_]US/i.test(v.lang) ? 10 : 0) + (/(premium|enhanced|siri|neural|natural)/i.test(v.name) ? 12 : 0) + (/(aaron|evan|nathan|alex|tom|reed|arthur|daniel)/i.test(v.name) ? 4 : 0) + (/google us english/i.test(v.name) ? 6 : 0);
    return all.sort((a, b) => score(b) - score(a));
  }
  load(briefing) { this.stop(); this.briefing = briefing; this.segments = briefing.segments || []; this.i = 0; }
  _ensureAudioGraph() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.buf = new Uint8Array(this.analyser.fftSize);
    } catch { this.ctx = null; }
  }
  /** Seconds into the current segment (for the show's progress bar). */
  get segTime() { return this.audio && !this.audio.paused ? this.audio.currentTime : this._fallbackStart ? (performance.now() - this._fallbackStart) / 1000 : 0; }
  play(from = this.i, offset = 0) {
    this.i = Math.max(0, Math.min(from, this.segments.length - 1));
    this.offset = offset > 1 ? offset : 0;
    this.playing = true;
    if (this.mode === 'neural') this._ensureAudioGraph();
    this._playCurrent();
    this.onState('playing');
  }
  _playCurrent() {
    const seg = this.segments[this.i];
    if (!seg) { this.playing = false; this.onState('ended'); this.onEnd(); return; }
    this.onSegment(seg, this.i);
    this._fallbackStart = 0;
    if (seg.audio) {
      window.speechSynthesis?.cancel();
      const off = this.offset; this.offset = 0;
      this.audio.src = off ? `${seg.audio}#t=${off.toFixed(1)}` : seg.audio; // join mid-sentence, like real live TV
      if (off) this.audio.addEventListener('loadedmetadata', () => { try { if (this.audio.currentTime < off - 1) this.audio.currentTime = off; } catch {} }, { once: true });
      this.audio.playbackRate = this.rate;
      const p = this.audio.play();
      if (p?.catch) p.catch(() => this._speakFallback());
    } else this._speakFallback();
  }
  _speakFallback() {
    const seg = this.segments[this.i];
    if (!seg || !window.speechSynthesis) return this._advance();
    window.speechSynthesis.cancel();
    this.offset = 0;
    this._fallbackStart = performance.now();
    const u = new SpeechSynthesisUtterance(seg.text);
    u.rate = this.rate;
    u.pitch = 0.85;
    if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-US';
    u.onend = () => { if (this.utter === u) this._advance(); };
    u.onerror = (e) => { if (!['interrupted', 'canceled'].includes(e.error) && this.utter === u) this._advance(); };
    this.utter = u;
    window.speechSynthesis.speak(u);
  }
  _advance() {
    if (!this.playing) return;
    if (this.onAdvance(this.i)) return; // the host switched to a new show
    this.i++;
    setTimeout(() => this.playing && this._playCurrent(), 280);
  }
  pause() { this.playing = false; this.audio.pause(); this.utter = null; window.speechSynthesis?.cancel(); this.onState('paused'); }
  stop() { this.playing = false; this.audio.pause(); this.utter = null; window.speechSynthesis?.cancel(); }
  next() { const was = this.playing; this.stop(); this.i = Math.min(this.segments.length - 1, this.i + 1); if (was) this.play(this.i); else this.onSegment(this.segments[this.i], this.i); }
  prev() { const was = this.playing; this.stop(); this.i = Math.max(0, this.i - 1); if (was) this.play(this.i); else this.onSegment(this.segments[this.i], this.i); }
  destroy() { this.stop(); cancelAnimationFrame(this._raf); try { this.ctx?.close(); } catch {} }
  _mouthLevel(t) {
    if (!this.playing) return 0;
    if (this.analyser && !this.audio.paused) {
      this.analyser.getByteTimeDomainData(this.buf);
      let sum = 0;
      for (let k = 0; k < this.buf.length; k++) { const v = (this.buf[k] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / this.buf.length);
      return Math.min(1, rms * 5.5);
    }
    const speaking = window.speechSynthesis?.speaking || (!this.audio.paused && !this.audio.ended);
    return speaking ? 0.35 + Math.abs(Math.sin(t / 70)) * 0.45 + Math.abs(Math.sin(t / 29)) * 0.2 : 0;
  }
  tick(t) {
    this._raf = requestAnimationFrame(this.tick);
    const svg = this.root.querySelector('.lion');
    if (!svg) return;
    const target = this._mouthLevel(t);
    this.level += (target - this.level) * (target > this.level ? 0.6 : 0.35);
    const open = 3 + this.level * 24;
    const jaw = svg.querySelector('.ln-jaw');
    const tongue = svg.querySelector('.ln-tongue');
    jaw.setAttribute('ry', open.toFixed(1));
    jaw.setAttribute('cy', (8 + open * 0.5).toFixed(1));
    tongue.setAttribute('ry', Math.max(0, open - 10).toFixed(1));
    tongue.setAttribute('cy', (12 + open * 0.8).toFixed(1));
    svg.querySelector('.ln-smile').style.opacity = this.level > 0.08 ? '0' : '1';
    const talking = this.playing && this.level > 0.05;
    const bob = talking ? Math.sin(t / 380) * 2.6 : Math.sin(t / 1300) * 0.8;
    svg.querySelector('.ln-head').setAttribute('transform', `rotate(${bob.toFixed(2)} 200 260) translate(0 ${(talking ? -this.level * 3 : 0).toFixed(1)})`);
    svg.querySelectorAll('.ln-brow').forEach((b, k) => b.setAttribute('transform', `translate(0 ${(-this.level * 5 * (k ? 1 : 0.8)).toFixed(1)})`));
    if (t > this._blinkT) { this._blinkStart = t; this._blinkT = t + 2200 + Math.random() * 3200; }
    const bp = this._blinkStart ? (t - this._blinkStart) / 150 : 2;
    const lid = bp < 1 ? Math.sin(bp * Math.PI) * 46 : 0;
    svg.querySelectorAll('.ln-lid').forEach((r) => r.setAttribute('height', lid.toFixed(1)));
  }
}

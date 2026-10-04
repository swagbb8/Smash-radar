// The engine's memory: every post, the topic queue and engine status, kept as plain JSON files under <dir>/data/.
// The same folder is published with the site, so the studio reads exactly what the engine wrote.
import fs from 'node:fs';
import path from 'node:path';
import { similarity } from './lib/text.mjs';

const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); };

export class Store {
  constructor(dir) {
    this.dir = dir; this.data = path.join(dir, 'data');
    this.index = read(path.join(this.data, 'index.json'), { version: 1, counter: 0, updated: null, posts: [] });
    this.topics = read(path.join(this.data, 'topics.json'), { used: {}, requests: [], ideas: [] });
    this.engine = read(path.join(this.data, 'engine.json'), { runs: [], totals: { made: 0, failed: 0 } });
    this.config = read(path.join(this.data, 'config.json'), {});     // Ash's public settings: names, money links, tone (never a key)
  }
  postPath(id) { return path.join(this.data, 'posts', id + '.json'); }
  post(id) { return read(this.postPath(id), null); }
  has(id) { return this.index.posts.some((p) => p.id === id); }
  /** A topic is a repeat if a published post already covers nearly the same ground. */
  isRepeat(topic) { return this.index.posts.some((p) => similarity(p.topic || p.title, topic) >= 0.6); }
  headlines(n = 12) { return this.index.posts.slice(0, n).map((p) => p.hook).filter(Boolean); }

  addPost(post) {
    let id = post.id; for (let k = 2; this.has(id); k++) id = `${post.id}-${k}`;
    const n = ++this.index.counter; const full = { ...post, id, n }; write(this.postPath(id), full);
    this.index.posts.unshift({ id, n, created: post.created, subject: post.subject, style: post.style, title: post.title, topic: post.topic, hook: post.hooks?.[post.hook || 0]?.text || post.title, hookType: post.hooks?.[post.hook || 0]?.type || '',
      hooks: (post.hooks || []).length, cred: post.credibility?.score ?? null, supports: post.supports, sources: (post.sources || []).length, claims: (post.claims || []).length, best: bestLevel(post), photos: (post.images || []).filter((i) => i && i.file).length, thumb: `data/thumb/${id}.jpg` });
    return full;
  }
  save() {
    this.index.updated = new Date().toISOString(); write(path.join(this.data, 'index.json'), this.index); write(path.join(this.data, 'topics.json'), this.topics); write(path.join(this.data, 'engine.json'), this.engine); write(path.join(this.data, 'config.json'), this.config);
  }
}

function bestLevel(post) { const l = (post.claims || []).map((c) => c.level); return l.includes('established') ? 'established' : l.includes('supported') ? 'supported' : l.length ? 'emerging' : 'none'; }

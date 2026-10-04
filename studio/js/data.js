// Reads what the engine published (never writes). Paths are relative to the site root, one level above /studio/.
export const ROOT = new URL('../', location.href.split('#')[0]);
const memo = new Map();
async function json(path, { fresh = false } = {}) {
  if (!fresh && memo.has(path)) return memo.get(path);
  const p = fetch(new URL(path, ROOT) + (fresh ? `?t=${Date.now()}` : ''), { cache: fresh ? 'no-store' : 'default' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  memo.set(path, p); const v = await p; if (v == null) memo.delete(path); return v;
}
export const loadIndex = () => json('data/index.json', { fresh: true }).then((v) => v || { posts: [], counter: 0, updated: null });
export const loadEngine = () => json('data/engine.json', { fresh: true }).then((v) => v || { runs: [], totals: {} });
export const loadTopics = () => json('data/topics.json', { fresh: true }).then((v) => v || { used: {}, requests: [], ideas: [] });
export const loadPost = (id) => json(`data/posts/${id}.json`);
export const loadTrace = (id) => json(`data/trace/${id}.json`);
export const loadVersion = () => json('version.json', { fresh: true });
export const asset = (path) => new URL(path, ROOT).href;

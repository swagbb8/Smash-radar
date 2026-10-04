// List GGUF model repos on Hugging Face that match a few family names, with file sizes (to pick what fits a 16 GB runner).
import fs from 'node:fs';
const fams = (process.env.FAMILIES || 'gemma-4,gemma-3-12b,qwen3.5,Qwen3-14B,ministral-3,phi-4,gpt-oss-20b,mistral-small,Qwen2.5-14B,Mistral-Nemo,llama-4,granite-4,lfm2,SmolLM3,deepseek').split(',');
const out = { at: new Date().toISOString(), families: {} };
const get = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'truth-engine' } }); return { status: r.status, json: r.ok ? await r.json() : null }; } catch (e) { return { status: 0, error: String(e.message) }; } };
for (const f of fams) {
  const r = await get(`https://huggingface.co/api/models?search=${encodeURIComponent(f)}&filter=gguf&sort=downloads&direction=-1&limit=12`);
  const repos = [];
  for (const m of (r.json || []).slice(0, 8)) {
    const t = await get(`https://huggingface.co/api/models/${m.id}/tree/main?recursive=false`);
    const files = (t.json || []).filter((x) => /\.gguf$/i.test(x.path)).map((x) => ({ f: x.path, gb: +((x.lfs?.size || x.size || 0) / 1e9).toFixed(2) })).filter((x) => /Q4_K_M|Q5_K_M|Q4_0|mxfp4|Q6_K/i.test(x.f)).slice(0, 5);
    repos.push({ id: m.id, downloads: m.downloads, gated: m.gated, updated: (m.lastModified || '').slice(0, 10), files });
  }
  out.families[f] = { status: r.status, repos };
}
fs.mkdirSync('probe-out', { recursive: true }); fs.writeFileSync('probe-out/probe-hf.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out).slice(0, 3000));

// Debug GitHub Models access from Actions (GITHUB_TOKEN + permissions: models: read).
import fs from 'node:fs';
const out = { at: new Date().toISOString(), tries: [] };
const tok = process.env.GITHUB_TOKEN;
async function tryReq(label, url, init) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(90000) });
    const txt = await r.text(); const h = {}; for (const [k, v] of r.headers) if (/location|ratelimit|retry|content-type|x-github|x-ms|server|via/i.test(k)) h[k] = v;
    out.tries.push({ label, status: r.status, ms: Date.now() - t0, headers: h, body: txt.slice(0, 1500) });
  } catch (e) { out.tries.push({ label, error: String(e.message || e), cause: String(e.cause?.message || e.cause || '') }); }
}
const H = { authorization: `Bearer ${tok}`, 'content-type': 'application/json', accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'truth-engine' };
const body = (model, extra = {}) => JSON.stringify({ model, messages: [{ role: 'system', content: 'Reply with compact JSON only.' }, { role: 'user', content: 'Return {"ok":true,"fact":"<one true sentence about sleep and memory>"}' }], ...extra });
await tryReq('catalog', 'https://models.github.ai/catalog/models', { headers: H });
await tryReq('chat gpt-4.1 (github.ai)', 'https://models.github.ai/inference/chat/completions', { method: 'POST', headers: H, body: body('openai/gpt-4.1', { max_tokens: 120 }) });
await tryReq('chat gpt-4o-mini json_mode', 'https://models.github.ai/inference/chat/completions', { method: 'POST', headers: H, body: body('openai/gpt-4o-mini', { max_tokens: 120, response_format: { type: 'json_object' } }) });
await tryReq('chat org-scoped', `https://models.github.ai/orgs/${process.env.GITHUB_REPOSITORY_OWNER}/inference/chat/completions`, { method: 'POST', headers: H, body: body('openai/gpt-4o-mini', { max_tokens: 60 }) });
await tryReq('azure legacy gpt-4o-mini', 'https://models.inference.ai.azure.com/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: body('gpt-4o-mini', { max_tokens: 120 }) });
await tryReq('azure legacy gpt-4.1', 'https://models.inference.ai.azure.com/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: body('gpt-4.1', { max_tokens: 120 }) });
await tryReq('api.github.com models', 'https://api.github.com/models/catalog', { headers: H });
await tryReq('pollinations openai', 'https://text.pollinations.ai/openai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'openai', messages: [{ role: 'user', content: 'Return JSON {"ok":true,"n":<the number of planets in the solar system>}' }], response_format: { type: 'json_object' } }) });
await tryReq('pollinations models', 'https://text.pollinations.ai/models', {});
fs.mkdirSync('probe-out', { recursive: true }); fs.writeFileSync('probe-out/probe-models.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1).slice(0, 5000));

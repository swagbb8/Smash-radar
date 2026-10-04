// One interface over every AI writer the engine can use.
//   local       an open-source model served by llama.cpp inside the GitHub runner (free, no key)      ← default
//   anthropic   Claude via ANTHROPIC_API_KEY (optional, paid)
//   openai      any OpenAI-compatible API via OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL (optional)
//   gemini      Google Gemini via GEMINI_API_KEY (optional, has a free tier)
//   groq        Groq via GROQ_API_KEY (optional, has a free tier)
// chat() always resolves (never throws): { ok, json, text, ms, usage, model, provider, error }.
import { http } from '../lib/http.mjs';

export function parseJSON(text) {
  if (!text) return null;
  let t = String(text).replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  t = t.slice(a, b + 1);
  for (const cand of [t, t.replace(/,\s*([}\]])/g, '$1'), t.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1')]) { try { return JSON.parse(cand); } catch {} }
  return null;
}

const env = (k, d = '') => process.env[k] || d;
export function providers() {
  return {
    local: { ready: !!env('LLM_BASE_URL'), model: env('LLM_MODEL', 'local'), free: true },
    anthropic: { ready: !!env('ANTHROPIC_API_KEY'), model: env('ANTHROPIC_MODEL', 'claude-haiku-4-5'), free: false },
    gemini: { ready: !!env('GEMINI_API_KEY'), model: env('GEMINI_MODEL', 'gemini-2.5-flash'), free: true },
    groq: { ready: !!env('GROQ_API_KEY'), model: env('GROQ_MODEL', 'llama-3.3-70b-versatile'), free: true },
    openai: { ready: !!env('OPENAI_API_KEY'), model: env('OPENAI_MODEL', 'gpt-4.1-mini'), free: false },
  };
}
/** The writer in use: TRUTH_LLM if set and ready, else the first ready one in this order. */
export function active() {
  const p = providers(); const want = env('TRUTH_LLM');
  if (want && p[want]?.ready) return { name: want, ...p[want] };
  for (const name of ['anthropic', 'gemini', 'groq', 'openai', 'local']) if (p[name].ready) return { name, ...p[name] };
  return null;
}

async function openaiCompat({ base, key, model, system, user, schema, schemaName, maxTokens, temperature, timeout, local, extra }) {
  const body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }], max_tokens: maxTokens, temperature, ...(extra || {}) };
  if (schema && local && !process.env.LLM_NO_SCHEMA) body.response_format = { type: 'json_schema', json_schema: { name: schemaName || 'out', strict: true, schema } };
  else if (schema && !process.env.LLM_NO_SCHEMA) body.response_format = { type: 'json_object' };
  if (local) body.cache_prompt = true;
  const r = await http(base.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) }, { timeout, retries: local ? 0 : 2, cache: false });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status} ${r.error || r.text.slice(0, 300)}` };
  let j; try { j = JSON.parse(r.text); } catch { return { ok: false, error: 'bad JSON from model server: ' + r.text.slice(0, 200) }; }
  const msg = j.choices?.[0]?.message || {}; const text = msg.content || '';
  return { ok: true, text, reasoning: msg.reasoning_content || null, finish: j.choices?.[0]?.finish_reason, usage: { in: j.usage?.prompt_tokens, out: j.usage?.completion_tokens }, timings: j.timings ? { prompt_tps: j.timings.prompt_per_second, gen_tps: j.timings.predicted_per_second, prompt_n: j.timings.prompt_n, gen_n: j.timings.predicted_n } : undefined };
}

async function anthropic({ model, system, user, schema, maxTokens, temperature, timeout }) {
  const r = await http('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, ...(system ? { system } : {}), messages: [{ role: 'user', content: user + (schema ? '\n\nReturn only the JSON object.' : '') }] }) }, { timeout, retries: 2, cache: false });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status} ${r.error || r.text.slice(0, 300)}` };
  let j; try { j = JSON.parse(r.text); } catch { return { ok: false, error: 'bad JSON from Anthropic' }; }
  return { ok: true, text: (j.content || []).map((c) => c.text || '').join(''), finish: j.stop_reason, usage: { in: j.usage?.input_tokens, out: j.usage?.output_tokens } };
}

export async function chat({ system = '', user, schema = null, schemaName = 'out', maxTokens = 1400, temperature = 0.6, timeout = 900000, provider = null, extra = null }) {
  const act = provider ? { name: provider, ...providers()[provider] } : active();
  if (!act || !act.ready) return { ok: false, error: 'no AI writer is configured', provider: act?.name || null };
  const t0 = Date.now(); let res;
  const common = { model: act.model, system, user, schema, schemaName, maxTokens, temperature, timeout, extra };
  try {
    if (act.name === 'local') res = await openaiCompat({ ...common, base: env('LLM_BASE_URL'), key: '', local: true });
    else if (act.name === 'anthropic') res = await anthropic(common);
    else if (act.name === 'gemini') res = await openaiCompat({ ...common, base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: env('GEMINI_API_KEY') });
    else if (act.name === 'groq') res = await openaiCompat({ ...common, base: 'https://api.groq.com/openai/v1', key: env('GROQ_API_KEY') });
    else res = await openaiCompat({ ...common, base: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), key: env('OPENAI_API_KEY') });
  } catch (e) { res = { ok: false, error: String(e.message || e) }; }
  const out = { ...res, ms: Date.now() - t0, provider: act.name, model: act.model };
  if (res.ok && schema) { out.json = parseJSON(res.text); if (!out.json) { out.ok = false; out.error = 'model did not return valid JSON'; } }
  return out;
}

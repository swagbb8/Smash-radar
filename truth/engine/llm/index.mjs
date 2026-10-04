// One interface over every AI writer the engine can use.
//   local       an open-source model served by llama.cpp inside the GitHub runner (free, no key)      ← default
//   anthropic   Claude via ANTHROPIC_API_KEY (optional, paid)
//   openai      any OpenAI-compatible API via OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL (optional)
//   gemini      Google Gemini via GEMINI_API_KEY (optional, has a free tier)
//   groq        Groq via GROQ_API_KEY (optional, has a free tier)
// chat() always resolves (never throws): { ok, json, text, ms, usage, model, provider, error }.
import fs from 'node:fs';
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
    mock: { ready: !!env('TRUTH_LLM_MOCK'), model: 'recorded answers (tests)', free: true },
  };
}
/** The writer in use: TRUTH_LLM if set and ready, else the first ready one in this order. */
export function active() {
  const p = providers(); const want = env('TRUTH_LLM');
  if (want && p[want]?.ready) return { name: want, ...p[want] };
  for (const name of ['mock', 'anthropic', 'gemini', 'groq', 'openai', 'local']) if (p[name].ready) return { name, ...p[name] };
  return null;
}

/** Local models answer slowly (minutes on a CPU). Streaming keeps the connection alive and lets us time the tokens. */
async function streamLocal(url, body, timeout) {
  const t0 = Date.now(); let first = 0, text = '', reasoning = '', finish = null, timings = null, usage = null, n = 0;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }), signal: AbortSignal.timeout(timeout) });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status} ${(await r.text()).slice(0, 300)}` };
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true }); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue; const data = line.slice(5).trim(); if (data === '[DONE]') continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      const d = j.choices?.[0]?.delta || {};
      if (d.content) { if (!first) first = Date.now(); text += d.content; n++; }
      if (d.reasoning_content) reasoning += d.reasoning_content;
      if (j.choices?.[0]?.finish_reason) finish = j.choices[0].finish_reason;
      if (j.timings) timings = j.timings; if (j.usage) usage = j.usage;
    }
  }
  const gen = first ? (Date.now() - first) / 1000 : 0;
  return { ok: true, text, reasoning: reasoning || null, finish, usage: { in: usage?.prompt_tokens ?? timings?.prompt_n, out: usage?.completion_tokens ?? timings?.predicted_n ?? n },
    timings: { first_s: first ? +((first - t0) / 1000).toFixed(1) : null, gen_s: +gen.toFixed(1), prompt_tps: timings?.prompt_per_second ? +timings.prompt_per_second.toFixed(1) : null, gen_tps: timings?.predicted_per_second ? +timings.predicted_per_second.toFixed(2) : gen ? +(n / gen).toFixed(2) : null } };
}

async function openaiCompat({ base, key, model, system, user, schema, schemaName, maxTokens, temperature, timeout, local, extra }) {
  const reasoning = local ? process.env.LLM_REASONING : '';                       // reasoning models think before they answer: give them room, keep the effort low
  const body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }], max_tokens: reasoning ? Math.round(maxTokens * 2.4) : maxTokens, temperature, ...(reasoning ? { chat_template_kwargs: { reasoning_effort: reasoning } } : {}), ...(extra || {}) };
  if (schema && local && !process.env.LLM_NO_SCHEMA) body.response_format = { type: 'json_schema', json_schema: { name: schemaName || 'out', strict: true, schema } };
  else if (schema && !process.env.LLM_NO_SCHEMA) body.response_format = { type: 'json_object' };
  const url = base.replace(/\/$/, '') + '/chat/completions';
  if (local) { body.cache_prompt = true; try { return await streamLocal(url, body, timeout); } catch (e) { return { ok: false, error: String(e.cause?.code || e.message || e) }; } }
  const r = await http(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body) }, { timeout: Math.min(timeout, 280000), retries: 2, cache: false });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status} ${r.error || r.text.slice(0, 300)}` };
  let j; try { j = JSON.parse(r.text); } catch { return { ok: false, error: 'bad JSON from model server: ' + r.text.slice(0, 200) }; }
  const msg = j.choices?.[0]?.message || {};
  return { ok: true, text: msg.content || '', reasoning: msg.reasoning_content || null, finish: j.choices?.[0]?.finish_reason, usage: { in: j.usage?.prompt_tokens, out: j.usage?.completion_tokens } };
}

async function anthropic({ model, system, user, schema, maxTokens, temperature, timeout }) {
  const r = await http('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, ...(system ? { system } : {}), messages: [{ role: 'user', content: user + (schema ? '\n\nReturn only the JSON object.' : '') }] }) }, { timeout: Math.min(timeout, 280000), retries: 2, cache: false });
  if (!r.ok) return { ok: false, error: `HTTP ${r.status} ${r.error || r.text.slice(0, 300)}` };
  let j; try { j = JSON.parse(r.text); } catch { return { ok: false, error: 'bad JSON from Anthropic' }; }
  return { ok: true, text: (j.content || []).map((c) => c.text || '').join(''), finish: j.stop_reason, usage: { in: j.usage?.input_tokens, out: j.usage?.output_tokens } };
}

/** Test double: TRUTH_LLM_MOCK points at a JSON file { "<schemaName>": [answer, answer, …] }; answers are served in order. */
const mockState = {};
function mock(schemaName) {
  const file = env('TRUTH_LLM_MOCK'); if (!mockState[file]) mockState[file] = { data: JSON.parse(fs.readFileSync(file, 'utf8')), i: {} };
  const st = mockState[file]; const list = st.data[schemaName] || []; const i = st.i[schemaName] || 0; st.i[schemaName] = i + 1;
  if (!list.length) return { ok: false, error: `no recorded answer for "${schemaName}"` };
  const a = list[Math.min(i, list.length - 1)]; return { ok: true, text: typeof a === 'string' ? a : JSON.stringify(a), finish: 'stop', usage: { in: 0, out: 0 } };
}

export async function chat({ system = '', user, schema = null, schemaName = 'out', maxTokens = 1400, temperature = 0.6, timeout = 1500000, provider = null, extra = null }) {
  const act = provider ? { name: provider, ...providers()[provider] } : active();
  if (!act || !act.ready) return { ok: false, error: 'no AI writer is configured', provider: act?.name || null };
  const t0 = Date.now(); let res;
  const common = { model: act.model, system, user, schema, schemaName, maxTokens, temperature, timeout, extra };
  try {
    if (act.name === 'mock') res = mock(schemaName);
    else if (act.name === 'local') res = await openaiCompat({ ...common, base: env('LLM_BASE_URL'), key: '', local: true });
    else if (act.name === 'anthropic') res = await anthropic(common);
    else if (act.name === 'gemini') res = await openaiCompat({ ...common, base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: env('GEMINI_API_KEY') });
    else if (act.name === 'groq') res = await openaiCompat({ ...common, base: 'https://api.groq.com/openai/v1', key: env('GROQ_API_KEY') });
    else res = await openaiCompat({ ...common, base: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'), key: env('OPENAI_API_KEY') });
  } catch (e) { res = { ok: false, error: String(e.message || e) }; }
  const out = { ...res, ms: Date.now() - t0, provider: act.name, model: act.model };
  if (res.ok && schema) { out.json = parseJSON(res.text); if (!out.json) { out.ok = false; out.error = 'model did not return valid JSON'; } }
  return out;
}

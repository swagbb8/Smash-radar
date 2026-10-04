// One interface over every AI writer the engine can use.
//   local      : an open-source model served by llama.cpp inside the job (no key, free)        <- default
//   anthropic  : Claude, when ANTHROPIC_API_KEY is set                                        (optional, paid)
//   openai-compatible : OpenAI / Groq / OpenRouter / Gemini, when the matching key is set     (optional)
// Every provider returns { text, json, ms, model, usage }. With `schema`, output is JSON (grammar-enforced on local).
import { extractJSON, sleep, log } from './lib/util.mjs';

const COMPAT = {
  openai: { base: 'https://api.openai.com/v1', key: 'OPENAI_API_KEY', model: 'gpt-4.1-mini' },
  groq: { base: 'https://api.groq.com/openai/v1', key: 'GROQ_API_KEY', model: 'llama-3.3-70b-versatile' },
  openrouter: { base: 'https://openrouter.ai/api/v1', key: 'OPENROUTER_API_KEY', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: 'GEMINI_API_KEY', model: 'gemini-2.5-flash' },
};

export function providerName() {
  const want = (process.env.TRUTH_LLM || 'auto').toLowerCase();
  if (want !== 'auto') return want;
  if (process.env.LLM_BASE_URL) return 'local';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  for (const [name, c] of Object.entries(COMPAT)) if (process.env[c.key]) return name;
  return 'local';
}

export function describe() {
  const p = providerName();
  if (p === 'local') return { provider: 'local', model: process.env.LLM_MODEL_NAME || 'open-source model (llama.cpp)', paid: false };
  if (p === 'anthropic') return { provider: 'anthropic', model: process.env.TRUTH_MODEL || 'claude-haiku-4-5', paid: true };
  return { provider: p, model: process.env.TRUTH_MODEL || COMPAT[p]?.model, paid: p !== 'openrouter' && p !== 'gemini' && p !== 'groq' };
}

export async function chat({ system = '', user, schema, schemaName = 'result', maxTokens = 1400, temperature = 0.6, label = 'llm', timeout = 45 * 60e3, retries = 1, extra = {} }) {
  const p = providerName(); let err;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const r = p === 'anthropic' ? await anthropic({ system, user, schema, maxTokens, temperature, timeout }) : await openaiCompat(p, { system, user, schema, schemaName, maxTokens, temperature, timeout, extra });
      r.ms = Date.now() - t0; r.json = schema ? extractJSON(r.text) : null;
      if (schema && r.json == null) throw new Error(`${label}: model did not return JSON: ${String(r.text).slice(0, 200)}`);
      return r;
    } catch (e) { err = e; log(`${label} attempt ${attempt + 1} failed: ${e.message}`); if (attempt < retries) await sleep(2000 * (attempt + 1)); }
  }
  throw err;
}

async function openaiCompat(p, { system, user, schema, schemaName, maxTokens, temperature, timeout, extra }) {
  const local = p === 'local'; const c = COMPAT[p];
  const base = local ? (process.env.LLM_BASE_URL || 'http://127.0.0.1:8080/v1') : c.base; const model = process.env.TRUTH_MODEL || (local ? (process.env.LLM_MODEL_NAME || 'local') : c.model);
  const headers = { 'content-type': 'application/json' }; if (!local) headers.authorization = `Bearer ${process.env[c.key]}`;
  const body = { model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: user }], max_tokens: maxTokens, temperature, ...extra };
  if (schema) body.response_format = local ? { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } } : { type: 'json_object' };
  const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const txt = await r.text(); if (!r.ok) throw new Error(`${p} HTTP ${r.status}: ${txt.slice(0, 300)}`);
  const j = JSON.parse(txt); const msg = j.choices?.[0]?.message || {};
  return { text: msg.content ?? '', reasoning: msg.reasoning_content || null, model: j.model || model, usage: j.usage || null, timings: j.timings || null, finish: j.choices?.[0]?.finish_reason };
}

async function anthropic({ system, user, schema, maxTokens, temperature, timeout }) {
  const model = process.env.TRUTH_MODEL || 'claude-haiku-4-5';
  const sys = schema ? `${system}\n\nReturn ONLY one JSON object that matches this JSON Schema, with no text before or after it:\n${JSON.stringify(schema)}` : system;
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system: sys, messages: [{ role: 'user', content: user }] }), signal: AbortSignal.timeout(Math.min(timeout, 180e3)) });
  const txt = await r.text(); if (!r.ok) throw new Error(`anthropic HTTP ${r.status}: ${txt.slice(0, 300)}`);
  const j = JSON.parse(txt); return { text: (j.content || []).map((c) => c.text || '').join(''), model: j.model, usage: j.usage, finish: j.stop_reason };
}

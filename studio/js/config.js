// What the engine should know from this device: account names, money links, tone. Public values only.
// The engine's own copy arrives in data/config.json; anything different here is "not sent yet".
import { S } from './state.js';

export const MONEY_KEYS = ['tips', 'amazon', 'adsense', 'product', 'newsletter'];
const pick = (local, live, d = '') => (local !== undefined && local !== null ? local : live ?? d);

export function wanted() {
  const e = S.settings.engine || {}; const c = S.config || {}; const m = {};
  for (const k of MONEY_KEYS) { const v = String(pick(S.settings.money?.[k], c.money?.[k], '')).trim(); if (v) m[k] = v; }
  return { handle: String(pick(S.settings.handle || undefined, c.handle, '')).replace(/^@/, '').trim(), domain: String(pick(e.domain, c.domain, '')).trim().toLowerCase(), intensity: Number(pick(e.intensity, c.intensity, 2)), daily: Number(pick(e.daily, c.daily, 6)), money: m };
}
export function unsent() {
  const w = wanted(); const c = S.config || {};
  return w.handle !== (c.handle || '') || w.domain !== (c.domain || '') || w.intensity !== (c.intensity ?? 2) || w.daily !== (c.daily ?? 6) || MONEY_KEYS.some((k) => (w.money[k] || '') !== (c.money?.[k] || ''));
}

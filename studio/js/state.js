// The studio's working state: the engine's library (read-only) + this device's own notes on each file.
import * as db from './db.js';
import { loadIndex, loadEngine, loadConfig, loadVersion } from './data.js';
import { ymd } from './ui.js';

export const S = { index: { posts: [] }, engine: { runs: [] }, config: {}, version: {}, local: new Map(), settings: {}, ready: false };
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export const DEFAULT_SETTINGS = { theme: {}, handle: '', site: '', perDay: 1, money: {}, followers: [], earnings: [] };

export async function boot() {
  const [index, engine, config, version, locals, settings] = await Promise.all([loadIndex(), loadEngine(), loadConfig(), loadVersion().catch(() => null), db.all('post:').catch(() => []), db.get('settings').catch(() => null)]);
  S.index = index; S.engine = engine; S.config = config; S.version = version || {}; S.local = new Map(locals.map(([k, v]) => [k.slice(5), v])); S.settings = { ...DEFAULT_SETTINGS, ...(settings || {}), theme: { ...DEFAULT_SETTINGS.theme, ...(settings?.theme || {}) } }; S.ready = true; emit();
}
export async function refresh() { const [index, engine, config] = await Promise.all([loadIndex(), loadEngine(), loadConfig()]); const changed = index.updated !== S.index.updated || engine.runs?.[0]?.at !== S.engine.runs?.[0]?.at; S.index = index; S.engine = engine; S.config = config; if (changed) emit(); return changed; }

export const local = (id) => S.local.get(id) || { status: 'new' };
export const statusOf = (id) => local(id).status || 'new';
export async function patch(id, change) { const next = { ...local(id), ...change, touched: new Date().toISOString() }; S.local.set(id, next); await db.set('post:' + id, next); emit(); return next; }
export async function saveSettings(change) { S.settings = { ...S.settings, ...change }; await db.set('settings', S.settings); emit(); }

export const summary = (id) => S.index.posts.find((p) => p.id === id) || null;
export const byStatus = (...st) => S.index.posts.filter((p) => st.includes(statusOf(p.id)));
/** Files nobody has opened yet, oldest first (the queue "Generate" draws from). */
export const waiting = () => S.index.posts.filter((p) => statusOf(p.id) === 'new').reverse();
/** Take the next n waiting files into drafts. → ids */
export async function take(n) { const ids = waiting().slice(0, n).map((p) => p.id); for (const id of ids) await patch(id, { status: 'draft', taken: new Date().toISOString() }); return ids; }

export const scheduledOn = (day) => S.index.posts.filter((p) => { const l = local(p.id); return l.date === day && ['scheduled', 'posted'].includes(l.status); });
/** Put approved files on the next free days, `perDay` each, starting today. → how many were placed */
export async function autoPlan(perDay = S.settings.perDay || 1) {
  const todo = byStatus('approved').reverse(); let placed = 0; const d = new Date();
  for (let guard = 0; todo.length && guard < 120; guard++) { const day = ymd(d); let free = perDay - scheduledOn(day).length; while (free-- > 0 && todo.length) { await patch(todo.shift().id, { status: 'scheduled', date: day }); placed++; } d.setDate(d.getDate() + 1); }
  return placed;
}
export const counts = () => { const c = { new: 0, draft: 0, approved: 0, scheduled: 0, posted: 0, skipped: 0 }; for (const p of S.index.posts) c[statusOf(p.id)] = (c[statusOf(p.id)] || 0) + 1; return c; };

/** Backup of everything stored on this device. */
export async function exportBackup() { return { app: 'the-truth-studio', at: new Date().toISOString(), settings: S.settings, posts: Object.fromEntries(S.local) }; }
export async function importBackup(b) { if (b?.app !== 'the-truth-studio') throw new Error('Not a studio backup file'); for (const [id, v] of Object.entries(b.posts || {})) { S.local.set(id, v); await db.set('post:' + id, v); } await saveSettings(b.settings || {}); }

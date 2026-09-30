// All /api/* routes on Netlify.
import { handleApi } from '../../src/api.js';
import { BlobStore } from '../lib.mjs';

export default async (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/api/events') return new Response('SSE not available on Netlify; the app polls instead.', { status: 404 });
  let body = {};
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) body = await req.json().catch(() => ({}));
  const out = await handleApi(
    { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body },
    { store: new BlobStore(), mode: 'netlify', deadlineMs: Number(process.env.NETLIFY_REFRESH_BUDGET_MS || 8500) },
  );
  return Response.json(out.body, { status: out.status, headers: { 'cache-control': 'no-store' } });
};

export const config = { path: '/api/*' };

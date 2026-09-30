// Runs every 5 minutes on Netlify and refreshes whichever sources are due (fast tier first).
import { refresh } from '../../src/collector.js';
import { BlobStore } from '../lib.mjs';

export default async () => {
  const run = await refresh(new BlobStore(), { trigger: 'netlify-schedule', deadlineMs: 24000 });
  console.log('[smash-radar] scheduled refresh', JSON.stringify(run));
  return new Response('ok');
};

export const config = { schedule: '*/5 * * * *' };

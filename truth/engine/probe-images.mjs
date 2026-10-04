// Picture-desk trial: what do the free image sources return for typical slide ideas? Saves pictures + credits for review.
import fs from 'node:fs';
import { findImages, fetchImages } from './images.mjs';
const ideas = (process.env.IDEAS || 'smartphone face down on a desk in a dark room|empty dinner table at night|silhouette of a person lit by a phone screen|empty subway platform at night|city skyline at night from above|earth at night from space|server room corridor|empty supermarket aisle|hands holding a smartphone close-up|alarm clock on a bedside table at night|crowd crossing a street seen from above|old television static in a dark room').split('|');
const out = { at: new Date().toISOString(), ideas: [] };
fs.mkdirSync('probe-out/img', { recursive: true });
const got = await fetchImages(ideas, 'probe-out/img', { prefix: 'idea' });
for (const [i, idea] of ideas.entries()) { const f = await findImages(idea); out.ideas.push({ idea, picked: got[i], top: f.items.slice(0, 5).map((c) => ({ p: c.provider, s: c.score, t: c.title.slice(0, 70), w: c.width, h: c.height, lic: c.licenseName, by: c.creator.slice(0, 40) })), errors: f.errors }); }
fs.writeFileSync('probe-out/probe-images.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out.ideas.map((x) => [x.idea, x.picked?.file, x.picked?.credit, x.picked?.score])));

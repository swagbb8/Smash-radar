// How the studio talks to the engine. The engine runs in GitHub Actions; the studio cannot start it by itself (that
// would need a key stored in the browser, which we never do). Instead a request is a GitHub issue that Ash submits
// while signed in to GitHub — the engine only obeys issues opened by the repository owner.
import { loadVersion } from './data.js';

let repo = '';
export async function repoName() {
  if (repo) return repo; const v = await loadVersion().catch(() => null);
  if (v?.repo) repo = v.repo;
  else { const m = location.hostname.match(/^([^.]+)\.github\.io$/); repo = m ? `${m[1]}/${location.pathname.split('/')[1]}` : 'swagbb8/Smash-radar'; }
  return repo;
}
const issue = async (title, body = '') => `https://github.com/${await repoName()}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

/** Links that open GitHub with a ready-made request. Ash taps "Submit new issue"; the engine does the rest. */
export const ask = {
  research: (topic, subject = '') => issue(`truth: research ${topic}`.slice(0, 240), `Research this topic and turn it into a file.${subject ? `\n\nsubject: ${subject}` : ''}\n\n(Sent from the studio. Tap "Submit new issue".)`),
  make: (n, subject = '') => issue(`truth: make ${n}${subject ? ' ' + subject : ''}`, `Make ${n} new file(s)${subject ? ` about ${subject}` : ''}.\n\n(Sent from the studio. Tap "Submit new issue".)`),
  rewrite: (id, slide, note = '') => issue(`truth: rewrite ${id} ${slide}`, `${note ? 'note: ' + note + '\n\n' : ''}(Sent from the studio. Tap "Submit new issue".)`),
  config: (cfg) => issue('truth: settings', '```json\n' + JSON.stringify(cfg, null, 1) + '\n```\n\n(Sent from the studio. Tap "Submit new issue".)'),
  remove: (id) => issue(`truth: remove ${id}`, 'Take this file off the website.\n\n(Sent from the studio. Tap "Submit new issue".)'),
};
export const actionsUrl = async () => `https://github.com/${await repoName()}/actions/workflows/truth.yml`;
export const secretsUrl = async () => `https://github.com/${await repoName()}/settings/secrets/actions`;
